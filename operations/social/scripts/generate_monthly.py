#!/usr/bin/env python3
"""
Tier 4: Monthly Website Page

1st of the month, 06:00 UTC:
  1. Read the past month's gists (daily summaries up to Feb 2026, when gists began)
  2. Count the month's merged PRs and contributors on GitHub
  3. AI synthesizes the month's themes
  4. Generate the website post: title, summary, cover prompt and story
  5. Generate one cover drawn from page one's cover and the previous month's story
  6. Commit everything directly to the news branch

The website's build diary reads it through index.json (build_news_index.py).

See operations/social/PIPELINE.md for full architecture.
"""

import base64
import calendar
import json
import re
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

from common import (
    GISTS_BRANCH,
    GITHUB_API_BASE,
    NEWS_REL_DIR,
    _github_headers,
    build_canonical_summary,
    call_pollinations_api,
    commit_files_to_branch,
    commit_image_to_branch,
    filter_daily_gists,
    generate_image,
    generate_platform_post,
    get_env,
    get_repo_root,
    gist_context,
    github_api_request,
    join_summary_parts,
    load_prompt,
    normalize_platform_post,
    parse_json_response,
    read_gists_for_date,
)

# ── Constants ────────────────────────────────────────────────────────

DAILY_REL_DIR = f"{NEWS_REL_DIR}/daily"
MONTHLY_REL_DIR = f"{NEWS_REL_DIR}/monthly"
# PR gists began on 2026-02-05; earlier months, February included, read daily summaries.
FIRST_GIST_MONTH = "2026-03"
COVER_WIDTH, COVER_HEIGHT = 2048, 1152  # 16:9, beside the text on the website
# One cover a month: the full Nano Banana 2 draws them at 2K, sharper than the Lite
# model the daily and weekly posts use.
COVER_MODEL = "nanobanana-2"
COVER_TRIES = 3
# Covers sit on the Community page, so they use the website's own art style and
# start from its Community artwork, Lantern Hill.
COMMUNITY_ART_URL = "https://raw.githubusercontent.com/pollinations/pollinations/main/pollinations.ai/public/art/community-hero-day.webp"
PAGE_ONE_WORLD = (
    "The second attached image is the Community page's artwork, Lantern Hill: draw this same "
    "place in exactly its style and palette, closer in, as a young village green with room to grow."
)
# Later covers are drawn from page one's garden with its characters removed: last
# month's cover would blur a little more each month, and page one itself makes the
# image model copy its characters where they stand. The story carries the growth.
PAGE_ONE_GARDEN = (
    "The second attached image is the garden of page one, without its characters: keep its "
    "art style, crisp pixels, first buildings and the colours of its ground, foliage and wood, "
    "but draw the garden as it stands now, grown well beyond page one as described above, "
    "in this page's moment rather than the attached garden's light."
)
# Each later page has its calendar month's light and weather, so the book turns through
# the seasons and a month rhymes with itself a year later. Page one keeps the Community
# artwork's daylight. June and September are still-light evenings; only December is dark.
MOMENTS = {
    "01": "a clear snowy morning in low warm sun, snow capping the roofs, beds and noticeboard, a few single-pixel snowflakes drifting",
    "02": "a frosty sunrise, frost on the beds and a pale peach glow low on the horizon, windows lit warm",
    "03": "a spring morning after rain in low warm sun with longer soft shadows, small puddles on the path and dew glinting as single white pixels on the leaves",
    "04": "a blossom day, apricot petals drifting across the green as single pixels",
    "05": "a bright late-spring afternoon, honey pollen motes drifting in the air",
    "06": "a long summer evening, still light under a warm apricot-cream sky, the bulbs lit and the first fireflies out as single honey pixels",
    "07": "a warm high-summer afternoon, dandelion seeds and pollen motes floating on the breeze",
    "08": "golden hour, warm low light from the right, long soft shadows and the bulbs just lit",
    "09": "a late-summer sunset after a warm shower, still light under a warm apricot-cream sky, puddles catching the first lit bulbs and a few fireflies over the grass",
    "10": "a crisp autumn afternoon, amber and apricot leaves falling and the lanterns lit early",
    "11": "a pale frosty morning in low sun, frost on the beds, the far hills soft and pale, windows lit warm",
    "12": "first snow after dusk, snowflakes falling, every bulb, lantern and window lit, the Hive's door glowing and the first stars out",
}
BARE_GARDEN = (
    "Redraw the attached garden scene exactly: the same composition, buildings, paths, plants, "
    "palette and pixel style, with every character removed. No bee, no robot, no round "
    "creature, no animals and no people; fill their places with garden."
)
CAST_COUNT = """List every living character in this pixel-art image, including tiny ones in the background, one entry per character with where it is. Return only JSON:
{"characters": [{"kind": "bee", "where": "centre, on the path"}]}
kind is one of:
- "bee": a yellow-and-brown striped bee character with a face
- "monitor_robot": a robot character whose head is a CRT monitor showing a face, or any screen showing a face with eyes
- "nomnom": a round tan blob creature with a face
- "black_cat": a black cat
- "axolotl": a mint-green axolotl with pink frilly gills
- "crystal_scribe": a purple crystal creature with a dark face, green eyes and round purple arms; not a robot
- "human": a person of any kind
- "other": any other creature
Screens, tiles, signs and panels with icons, glyphs or pictures are scenery, not characters. List each character once."""
# Counts the cast in each cover. On five hand-counted covers it made every pass/fail
# call right; gpt-6-sol over-counted screens and cats and rejected a clean cover.
VISION_MODEL = "google/gemini-3.8-flash"
CAST_KINDS = {"bee": "bees", "monitor_robot": "monitor_robots", "nomnom": "nomnom",
              "black_cat": "black_cats", "axolotl": "axolotls",
              "crystal_scribe": "crystal_scribes", "human": "humans"}
NO_CAST = dict.fromkeys(CAST_KINDS.values(), 0)
ONE_OF_EACH = (
    "The bee mascot, the monitor robot and the round Nomnom creature each appear at most once: "
    "no copies, no extra bees or robots, no toy robots, statues or screens with faces. "
    "No humans or people anywhere, not even small in the background. Pictures, canvases and "
    "notices show plants or landscapes, never faces."
)
# Creatures move onto Lantern Hill one at a time as the community grows: each the first
# month at least `contributors` people and agents merge a pull request, then they stay.
# Their looks are prompts/brand/creatures/<id>.png.
CREATURES_URL = "https://raw.githubusercontent.com/pollinations/pollinations/main/operations/social/prompts/brand/creatures"
CREATURES = {
    "cosmic-cat": {"name": "the cosmic cat", "contributors": 20, "count": "black_cats"},
    "axolotl": {"name": "the mint axolotl", "contributors": 80, "count": "axolotls"},
    "crystal-scribe": {"name": "the crystal scribe", "contributors": 140, "count": "crystal_scribes"},
}

# Every merged PR by anyone, agents and bots included, on any base branch. Release
# PRs into production are left out: they copy work already merged into main.
MERGED_PRS = "is:pr is:merged -base:production"
SEARCH_CAP = 1000  # GitHub search returns at most this many results per query
SEARCH_QUERY = """
query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number
        author { login avatarUrl(size: 80) url }
        mergeCommit { message }
      }
    }
  }
}
"""
# Co-authored-by trailers with a GitHub noreply address name the account:
# "Name <12345+login@users.noreply.github.com>". Bot accounts ("login[bot]@…") don't match.
NOREPLY_COAUTHOR = re.compile(
    r"^co-authored-by:[^<\n]*<(?:\d+\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com>",
    re.IGNORECASE | re.MULTILINE,
)


# ── Helpers ──────────────────────────────────────────────────────────

def get_target_month(override: Optional[str] = None) -> str:
    """Return YYYY-MM, defaulting to the last completed UTC month."""
    if override:
        datetime.strptime(override, "%Y-%m")
        return override
    today = datetime.now(timezone.utc).date()
    previous_month_end = today.replace(day=1) - timedelta(days=1)
    return previous_month_end.strftime("%Y-%m")


def month_dates(month: str) -> tuple[str, str]:
    year, month_number = (int(part) for part in month.split("-"))
    final_day = calendar.monthrange(year, month_number)[1]
    return f"{month}-01", f"{month}-{final_day:02d}"


def read_gists_for_month(month: str) -> List[Dict]:
    start, end = (date.fromisoformat(day) for day in month_dates(month))
    gists = []
    while start <= end:
        gists.extend(read_gists_for_date(start.isoformat()))
        start += timedelta(days=1)
    return gists


def read_daily_summaries(month: str, repo_root: Optional[str] = None) -> List[Dict]:
    """The month's daily summaries: the record for months before FIRST_GIST_MONTH."""
    daily_root = Path(repo_root or get_repo_root()) / DAILY_REL_DIR
    return [
        json.loads(path.read_text(encoding="utf-8"))
        for path in sorted(daily_root.glob(f"{month}-*/summary.json"))
    ]


def read_earlier_pages(month: str, repo_root: Optional[str] = None) -> List[Dict]:
    """Website pages before `month`, oldest first: page one anchors every cover, the
    latest carries the story, so a missed month never restarts it."""
    monthly_root = Path(repo_root or get_repo_root()) / MONTHLY_REL_DIR
    return [
        json.loads(path.read_text(encoding="utf-8"))
        for path in sorted(monthly_root.glob("*/website.json"))
        if path.parent.name < month
    ]


# ── Step 1: Count merged PRs and contributors ───────────────────────

def merged_prs(month: str, token: str, repository: str) -> List[Dict]:
    """Every PR merged in the month, searched a week at a time to stay under the search cap."""
    start, end = (date.fromisoformat(day) for day in month_dates(month))
    prs = {}
    while start <= end:
        stop = min(start + timedelta(days=6), end)
        query = f"repo:{repository} {MERGED_PRS} merged:{start}..{stop}"
        after = None
        while True:
            response = github_api_request(
                "POST",
                f"{GITHUB_API_BASE}/graphql",
                headers=_github_headers(token),
                json={"query": SEARCH_QUERY, "variables": {"q": query, "after": after}},
            )
            payload = response.json()
            if response.status_code != 200 or payload.get("errors"):
                raise RuntimeError(f"GitHub search failed: {response.status_code} {payload.get('errors')}")
            search = payload["data"]["search"]
            if search["issueCount"] > SEARCH_CAP:
                raise RuntimeError(f"{query} matches {search['issueCount']} PRs, over the search cap")
            prs.update((node["number"], node) for node in search["nodes"] if node)
            if not search["pageInfo"]["hasNextPage"]:
                break
            after = search["pageInfo"]["endCursor"]
        start = stop + timedelta(days=1)
    return list(prs.values())


def rank_contributors(prs: List[Dict]) -> List[Dict]:
    """Merged PRs per account: authors (people, agents and bots) plus noreply co-authors."""
    people = {}
    for pr in prs:
        accounts = {}
        author = pr.get("author") or {}  # null for deleted accounts
        if author.get("login"):
            accounts[author["login"].lower()] = (author["login"], author.get("avatarUrl"), author.get("url"))
        message = (pr.get("mergeCommit") or {}).get("message") or ""
        for login in NOREPLY_COAUTHOR.findall(message):
            accounts.setdefault(login.lower(), (login, None, None))
        for key, (login, avatar_url, url) in accounts.items():
            person = people.setdefault(key, {
                "login": login,
                "avatar_url": avatar_url or f"https://github.com/{login}.png?size=80",
                "url": url or f"https://github.com/{login}",
                "prs": 0,
            })
            person["prs"] += 1
    return sorted(people.values(), key=lambda person: (-person["prs"], person["login"].lower()))


# ── Step 2: Generate monthly summary ────────────────────────────────

def generate_digest(gists: List[Dict], daily_summaries: List[Dict], month: str,
                    token: str) -> Optional[Dict]:
    """Synthesize the month's gists, or its daily summaries before gists began."""
    if gists:
        by_date = defaultdict(list)
        for gist in gists:
            by_date[gist.get("merged_at", "")[:10] or "unknown"].append(gist_context(gist))
        heading = "PR gists by date"
        sections = [{"date": day, "pr_count": len(prs), "prs": prs} for day, prs in sorted(by_date.items())]
        pr_count = len(gists)
    else:
        heading = "Daily summaries (this month predates PR gists)"
        sections = [
            {key: summary.get(key) for key in ("date", "title", "summary", "pr_count")}
            for summary in daily_summaries
        ]
        pr_count = sum(int(summary.get("pr_count") or 0) for summary in daily_summaries)

    user_prompt = f"""Month: {month}
PRs selected for this recap: {pr_count}. This is not the total number of merges.
Active days: {len(sections)}

{heading}:
{json.dumps(sections, indent=2, ensure_ascii=False)}"""

    response = call_pollinations_api(load_prompt("monthly"), user_prompt, token, temperature=0.3)
    if not response:
        return None
    return parse_json_response(response)


def build_monthly_summary_artifact(
    digest: Dict,
    prs: List[Dict],
    month: str,
    merged: List[Dict],
    contributors: List[Dict],
    generated_at: str,
) -> Dict:
    """The canonical summary plus the month's GitHub counts for the website."""
    period_start, period_end = month_dates(month)
    arcs = digest.get("arcs") or []
    theme = (digest.get("theme") or "").strip()
    headline = next(
        ((arc.get("headline") or "").strip() for arc in arcs if (arc.get("headline") or "").strip()),
        "",
    )
    title = headline or theme or datetime.strptime(month, "%Y-%m").strftime("%B %Y")
    arc_summaries = [
        (arc.get("summary") or "").strip()
        for arc in arcs[:4]
        if (arc.get("summary") or "").strip()
    ]
    summary_text = join_summary_parts(
        ([theme] if theme and theme != title else []) + arc_summaries
    )

    return {
        **build_canonical_summary(
            date=period_end,
            period_start=period_start,
            period_end=period_end,
            title=title,
            summary=summary_text or theme or title,
            prs=prs,
            generated_at=generated_at,
        ),
        "merged_prs": len(merged),
        "contributors": contributors,
    }


# ── Step 3: Generate the website post ───────────────────────────────

def story_context(previous_page: Optional[Dict]) -> str:
    """The Monthly Story rules, plus where the previous page left the story."""
    prompt = load_prompt("monthly")
    rules = prompt[prompt.index("## Monthly Story"):]
    story = ((previous_page or {}).get("metadata") or {}).get("story")
    if not story:
        return f"\n\n{rules}\n\nThere is no earlier page: this cover is page one."
    return f"\n\n{rules}\n\nThe previous page ({previous_page['period_start'][:7]}) left the story here: {story}"


def residents(moved_in: List[str], contributors: int) -> List[str]:
    """Creatures living on Lantern Hill this month: those already moved in, plus the next
    one once the community is big enough for it."""
    newcomer = next((name for name in CREATURES if name not in moved_in), None)
    if newcomer and contributors >= CREATURES[newcomer]["contributors"]:
        return [*moved_in, newcomer]
    return list(moved_in)


def community_context(contributors: int, merged: int, living: List[str], newcomer: Optional[str]) -> str:
    names = ", ".join(CREATURES[name]["name"] for name in living)
    return " ".join([
        f"The community this month: {contributors} people and agents merged {merged} pull requests.",
        f"Living on Lantern Hill besides Polli, the robot and Nomnom: {names}." if living
        else "No other creatures live on Lantern Hill yet.",
        *([f"{CREATURES[newcomer]['name'].capitalize()} moves in this month."] if newcomer else []),
    ])


def generate_website_post(digest: Dict, token: str, previous_page: Optional[Dict],
                          page_notes: str) -> Optional[Dict]:
    return generate_platform_post(
        "website", digest, token,
        "Write this month's page of the website build diary.",
        extra_context=f"{story_context(previous_page)}\n\n{page_notes}",
    )


# ── Step 4: Draw the cover, one of each character ───────────────────

def count_cast(image_bytes: bytes, token: str) -> Optional[Dict]:
    """Count the cast in a cover with a vision call on our own API."""
    mime = "image/png" if image_bytes[:4] == b"\x89PNG" else "image/jpeg"
    image_url = f"data:{mime};base64,{base64.b64encode(image_bytes).decode()}"
    response = call_pollinations_api(
        "You count characters in images precisely.",
        [
            {"type": "text", "text": CAST_COUNT},
            {"type": "image_url", "image_url": {"url": image_url}},
        ],
        token,
        temperature=0,
        response_format={"type": "json_object"},
        model=VISION_MODEL,
    )
    listed = parse_json_response(response) if response else None
    if listed is None:
        return None
    counts = dict.fromkeys(NO_CAST, 0)
    for character in listed.get("characters") or []:
        key = CAST_KINDS.get(character.get("kind"))
        if key:
            counts[key] += 1
    return counts


def website_art(section: str) -> str:
    """One section (Style or Cast) of the website's art style, prompts/brand/website-art.md."""
    text = load_prompt("brand/website-art")
    return text.split(f"## {section}\n", 1)[1].split("\n## ", 1)[0].strip()


def draw_checked(prompt: str, token: str, references: List[str], limits: Dict[str, int],
                 cast: bool = True) -> Optional[bytes]:
    """Draw until the counted cast fits `limits`, so no cover shows a character twice."""
    style = website_art("Style") + (f" {website_art('Cast')}" if cast else "")
    for attempt in range(1, COVER_TRIES + 1):
        image_bytes, _ = generate_image(
            prompt, token, COVER_WIDTH, COVER_HEIGHT, model=COVER_MODEL,
            references=references, cast=cast, style=style,
        )
        if not image_bytes:
            continue
        counts = count_cast(image_bytes, token)
        if counts is not None and all(int(counts.get(name, 0)) <= limit for name, limit in limits.items()):
            return image_bytes
        print(f"  Try {attempt}/{COVER_TRIES} rejected: {counts}")
    return None


# ── Main ─────────────────────────────────────────────────────────────

def main():
    print("=== Tier 4: Monthly Website Page ===")

    github_token = get_env("GITHUB_TOKEN")
    pollinations_token = get_env("POLLINATIONS_TOKEN")
    repository = get_env("GITHUB_REPOSITORY")
    owner, repo = repository.split("/")
    month = get_target_month(get_env("TARGET_MONTH", required=False))
    period_start, period_end = month_dates(month)
    base_path = f"{MONTHLY_REL_DIR}/{month}"
    print(f"  Month: {month}")

    # ── Read the month ───────────────────────────────────────────────
    print(f"\n[1/5] Reading updates for {month}...")
    from_gists = month >= FIRST_GIST_MONTH
    gists = filter_daily_gists(read_gists_for_month(month)) if from_gists else []
    daily_summaries = [] if from_gists else read_daily_summaries(month)
    print(f"  {len(gists)} daily-tier gists, {len(daily_summaries)} daily summaries")
    if not gists and not daily_summaries:
        print("  Nothing recorded for this month. Skipping.")
        return

    # ── Count merged PRs and contributors ────────────────────────────
    print("\n[2/5] Counting merged PRs and contributors...")
    merged = merged_prs(month, github_token, repository)
    contributors = rank_contributors(merged)
    print(f"  {len(merged)} merged PRs, {len(contributors)} contributors")

    # ── Generate summary ─────────────────────────────────────────────
    print("\n[3/5] Generating monthly summary...")
    digest = generate_digest(gists, daily_summaries, month, pollinations_token)
    if not digest:
        print("  FATAL: Monthly digest generation failed")
        sys.exit(1)
    print(f"  Theme: {digest.get('theme', '')}")
    generated_at = datetime.now(timezone.utc).isoformat()
    selected = (
        [{"number": gist.get("pr_number"), "date": (gist.get("merged_at") or "")[:10]} for gist in gists]
        or [pr for summary in daily_summaries for pr in summary.get("prs") or []]
    )
    summary_artifact = build_monthly_summary_artifact(
        digest, selected, month, merged, contributors, generated_at
    )

    # ── Generate the website post and its cover ──────────────────────
    print("\n[4/5] Generating the website page...")
    earlier_pages = read_earlier_pages(month)
    previous_page = earlier_pages[-1] if earlier_pages else None
    print(f"  Continues: {previous_page['period_start'][:7] if previous_page else 'nothing, page one'}")
    moved_in = ((previous_page or {}).get("metadata") or {}).get("creatures") or []
    living = residents(moved_in, len(contributors))
    newcomer = living[-1] if len(living) > len(moved_in) else None
    print(f"  Creatures: {', '.join(living) or 'none yet'}{f' ({newcomer} moves in)' if newcomer else ''}")
    moment = f"This page's moment: {MOMENTS[month[5:]]}." if earlier_pages else (
        "This page's moment: the Community artwork's soft clear daylight.")
    community = community_context(len(contributors), len(merged), living, newcomer)
    post = generate_website_post(digest, pollinations_token, previous_page, f"{community}\n\n{moment}")
    if not post:
        print("  FATAL: Monthly website post generation failed")
        sys.exit(1)
    missing = [field for field in ("title", "summary", "image_prompt", "story") if not post.get(field)]
    if missing:
        print(f"  FATAL: Monthly website post is missing {', '.join(missing)}")
        sys.exit(1)

    # Page one starts from the Community artwork; later pages from page one's garden.
    anchor = [earlier_pages[0]["metadata"]["garden"]] if earlier_pages else [COMMUNITY_ART_URL]
    post["creatures"] = living
    names = " and ".join(CREATURES[name]["name"] for name in living)
    prompt = " ".join([
        post["image_prompt"],
        PAGE_ONE_GARDEN if earlier_pages else PAGE_ONE_WORLD,
        moment,
        *([f"Attached last: {names}, who live on Lantern Hill. "
           "Draw each exactly once, true to its look."] if living else []),
        ONE_OF_EACH,
    ])
    limits = {**NO_CAST, "bees": 1, "monitor_robots": 1, "nomnom": 1,
              **{CREATURES[name]["count"]: 1 for name in living}}
    references = anchor + [f"{CREATURES_URL}/{name}.png" for name in living]
    image_bytes = draw_checked(prompt, pollinations_token, references, limits)
    if not image_bytes:
        print(f"  FATAL: No cover with one of each character after {COVER_TRIES} tries")
        sys.exit(1)
    url = commit_image_to_branch(
        image_bytes, f"{base_path}/images/website.jpg", GISTS_BRANCH,
        github_token, owner, repo,
    )
    if not url:
        print("  FATAL: Monthly cover commit failed")
        sys.exit(1)
    post["image"] = {"url": url, "prompt": prompt}

    if not earlier_pages:
        # Page one also keeps its garden without characters, for later covers.
        garden_bytes = draw_checked(BARE_GARDEN, pollinations_token, [url], NO_CAST, cast=False)
        garden_url = garden_bytes and commit_image_to_branch(
            garden_bytes, f"{base_path}/images/garden.jpg", GISTS_BRANCH,
            github_token, owner, repo,
        )
        if not garden_url:
            print("  FATAL: Page one's garden without characters failed")
            sys.exit(1)
        post["garden"] = garden_url

    # ── Commit to news branch ────────────────────────────────────────
    print("\n[5/5] Committing the month to the news branch...")
    ok = commit_files_to_branch(
        [
            (f"{base_path}/summary.json", summary_artifact),
            (f"{base_path}/website.json", normalize_platform_post(
                platform="website",
                scope="monthly",
                date=period_end,
                period_start=period_start,
                period_end=period_end,
                generated_at=generated_at,
                raw_post=post,
            )),
        ],
        GISTS_BRANCH,
        github_token,
        owner,
        repo,
        label=f"for monthly page {month}",
    )
    if not ok:
        print("\n=== Failed to commit monthly content ===")
        sys.exit(1)
    print("\n=== Done! ===")


if __name__ == "__main__":
    main()
