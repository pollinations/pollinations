#!/usr/bin/env python3
"""
Tier 4: Monthly Website Page

1st of the month, 06:00 UTC:
  1. Read the past month's gists
  2. Count the month's merged PRs and contributors on GitHub
  3. AI synthesizes the month's themes
  4. Generate the website post: title, summary, cover prompt and story
  5. Generate one cover that carries on the previous month's story
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
from functools import lru_cache
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

MONTHLY_REL_DIR = f"{NEWS_REL_DIR}/monthly"
COVER_WIDTH, COVER_HEIGHT = 2048, 1152  # 16:9, beside the text on the website
# One cover a month: the full Nano Banana 2 draws them at 2K, sharper than the Lite
# model the daily and weekly posts use.
COVER_MODEL = "nanobanana-2"
COVER_TRIES = 3
# Covers are drawn like the news posts: the same style, from the character sheet and the
# story alone. A reference image of an earlier page made every page copy it, so its
# growth never added up; these landmarks keep each fresh view in the same place.
LANTERN_HILL = (
    "The place is Lantern Hill: a glowing lime vine-tree at its heart, Polli's little round "
    "cottage with a glowing door at its foot, a sandy path curving up the hill and misty green "
    "hills beyond. Show at least two of these landmarks."
)
PAGE_ONE = "This is page one: Lantern Hill is young and small, with room to grow."
# Each later page has its calendar month's light and weather, so the book turns through
# the seasons and a month rhymes with itself a year later. Page one keeps the Community
# artwork's daylight. June and September are still-light evenings; only December is dark.
MOMENTS = {
    "01": "a clear snowy morning in low warm sun, snow capping the roofs, beds and noticeboard, a few single-pixel snowflakes drifting",
    "02": "a frosty sunrise, frost on the beds and a pale peach glow low on the horizon, windows lit warm",
    "03": "a spring morning after rain in low warm sun with longer soft shadows, small puddles on the path and dew glinting as single white pixels on the leaves",
    "04": "a blossom day, apricot petals drifting across the green as single pixels",
    "05": "a bright late-spring afternoon, honey pollen motes drifting in the air",
    "06": "a long summer evening, still light under a warm apricot-cream sky, the bulbs lit and the first fireflies out as tiny glowing dots",
    "07": "a warm high-summer afternoon, dandelion seeds and pollen motes floating on the breeze",
    "08": "golden hour, warm low light from the right, long soft shadows and the bulbs just lit",
    "09": "a late-summer sunset after a warm shower, still light under a warm apricot-cream sky, puddles catching the first lit bulbs and a few fireflies as tiny glowing dots over the grass",
    "10": "a crisp autumn afternoon, amber and apricot leaves falling and the lanterns lit early",
    "11": "a pale frosty morning in low sun, frost on the beds, the far hills soft and pale, windows lit warm",
    "12": "first snow after dusk, snowflakes falling, every bulb, lantern and window lit, Polli's cottage door glowing and the first stars out",
}
CAST_COUNT = """List every living character in this pixel-art image, including tiny ones in the background, one entry per character with where it is. Return only JSON:
{"characters": [{"kind": "bee", "where": "centre, on the path"}]}
kind is one of:
- "bee": a yellow-and-brown striped bee of any size, even a tiny one flying in the background
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
    "Every character appears exactly once: no copies, no toy robots or statues, and Polli is the "
    "only bee, with no other bees anywhere, not even tiny ones in the air. The robot's screen "
    "always shows its own face: two square eyes and a small smile. Only the characters have "
    "faces: no masks, no faces on flowers or objects, and other screens, pictures, film frames "
    "and signs show plants, landscapes or soft light, never faces, creatures, code or text. "
    "No humans anywhere. No letters, words or glyphs."
)
# Polli founds Lantern Hill alone on page one. The others move in one at a time as the
# community grows: each the first month at least `community` people and agents have
# merged a pull request since page one, and then they stay. The robot and Nomnom are on
# the character sheet; the creatures' looks are prompts/brand/creatures/<id>.png.
CREATURES_URL = "https://raw.githubusercontent.com/pollinations/pollinations/main/operations/social/prompts/brand/creatures"
RESIDENTS = {
    "polli": {"name": "Polli the bee", "community": 0, "count": "bees"},
    "robot": {"name": "the monitor robot", "community": 25, "count": "monitor_robots"},
    "nomnom": {"name": "Nomnom", "community": 50, "count": "nomnom"},
    "cosmic-cat": {"name": "the cosmic cat", "community": 200, "count": "black_cats",
                   "look": "a black cat with a deep navy starry coat, a small constellation on its chest "
                           "and lime-green eyes, never pastel or lavender"},
    "axolotl": {"name": "the mint axolotl", "community": 400, "count": "axolotls",
                "look": "a mint-green axolotl with pink frilly gills and a cream belly"},
    "crystal-scribe": {"name": "the crystal scribe", "community": 600, "count": "crystal_scribes",
                       "look": "a purple crystal creature with a dark face, green eyes and round purple arms"},
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
        author { login avatarUrl(size: 80) url ... on User { databaseId } ... on Bot { databaseId } }
        mergeCommit { message }
      }
    }
  }
}
"""
# Co-authored-by trailers with a GitHub noreply address name the account:
# "Name <12345+login@users.noreply.github.com>". Bot accounts ("login[bot]@…") don't match.
NOREPLY_COAUTHOR = re.compile(
    r"^co-authored-by:[^<\n]*<(?:(\d+)\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com>",
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


def read_previous_page(month: str, repo_root: Optional[str] = None) -> Optional[Dict]:
    """The latest website page before `month`: it carries the story and who lives there,
    so a missed month never restarts them. None on page one."""
    monthly_root = Path(repo_root or get_repo_root()) / MONTHLY_REL_DIR
    earlier = [path for path in sorted(monthly_root.glob("*/website.json")) if path.parent.name < month]
    return json.loads(earlier[-1].read_text(encoding="utf-8")) if earlier else None


def community_size(month: str, contributors: List[Dict], repo_root: Optional[str] = None) -> int:
    """Everyone who has merged a pull request from page one up to and including `month`."""
    monthly_root = Path(repo_root or get_repo_root()) / MONTHLY_REL_DIR
    ids = {person["id"] for person in contributors}
    for path in monthly_root.glob("*/summary.json"):
        if path.parent.name < month:
            summary = json.loads(path.read_text(encoding="utf-8"))
            ids |= {person["id"] for person in summary["contributors"]}
    return len(ids)


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


@lru_cache(maxsize=None)
def github_user_id(login: str, token: str) -> Optional[int]:
    """The numeric id of a GitHub account, for co-author lines that give only its login."""
    response = github_api_request("GET", f"{GITHUB_API_BASE}/users/{login}", headers=_github_headers(token))
    return response.json().get("id") if response.status_code == 200 else None


def rank_contributors(prs: List[Dict], token: str) -> List[Dict]:
    """Merged PRs per GitHub account id, which stays the same when an account is renamed:
    authors (people, agents and bots) plus noreply co-authors."""
    people = {}
    for pr in prs:
        accounts = {}
        author = pr.get("author") or {}  # null for deleted accounts
        if author.get("databaseId"):
            accounts[author["databaseId"]] = (author["login"], author.get("avatarUrl"), author.get("url"))
        message = (pr.get("mergeCommit") or {}).get("message") or ""
        for user_id, login in NOREPLY_COAUTHOR.findall(message):
            user_id = int(user_id) if user_id else github_user_id(login.lower(), token)
            if user_id:  # None when the account no longer exists
                accounts.setdefault(user_id, (login, None, None))
        for user_id, (login, avatar_url, url) in accounts.items():
            person = people.setdefault(user_id, {
                "id": user_id,
                "login": login,
                "avatar_url": avatar_url or f"https://avatars.githubusercontent.com/u/{user_id}?s=80",
                "url": url or f"https://github.com/{login}",
                "prs": 0,
            })
            person["prs"] += 1
    return sorted(people.values(), key=lambda person: (-person["prs"], person["login"].lower()))


# ── Step 2: Generate monthly summary ────────────────────────────────

def generate_digest(gists: List[Dict], month: str, token: str) -> Optional[Dict]:
    """Synthesize the month's gists."""
    by_date = defaultdict(list)
    for gist in gists:
        by_date[gist.get("merged_at", "")[:10] or "unknown"].append(gist_context(gist))
    sections = [{"date": day, "pr_count": len(prs), "prs": prs} for day, prs in sorted(by_date.items())]

    user_prompt = f"""Month: {month}
PRs selected for this recap: {len(gists)}. This is not the total number of merges.
Active days: {len(sections)}

PR gists by date:
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


def residents(moved_in: List[str], community: int) -> List[str]:
    """Who lives on Lantern Hill this month: those already moved in, plus the next one
    once the community is big enough for it."""
    newcomer = next((name for name in RESIDENTS if name not in moved_in), None)
    if newcomer and community >= RESIDENTS[newcomer]["community"]:
        return [*moved_in, newcomer]
    return list(moved_in)


def community_context(contributors: int, merged: int, community: int, living: List[str],
                      newcomer: Optional[str]) -> str:
    names = ", ".join(RESIDENTS[name]["name"] for name in living)
    return " ".join([
        f"The community: {contributors} people and agents merged {merged} pull requests this month,",
        f"{community} since page one. Living on Lantern Hill: {names}; no one else.",
        *([f"{RESIDENTS[newcomer]['name'].capitalize()} moves in this month."] if newcomer else []),
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


def draw_checked(prompt: str, token: str, references: List[str], limits: Dict[str, int]) -> Optional[bytes]:
    """Draw until the counted cast fits `limits`, so no cover shows a character twice."""
    for attempt in range(1, COVER_TRIES + 1):
        image_bytes, _ = generate_image(
            prompt, token, COVER_WIDTH, COVER_HEIGHT, model=COVER_MODEL, references=references,
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
    gists = filter_daily_gists(read_gists_for_month(month))
    print(f"  {len(gists)} daily-tier gists")
    if not gists:
        print("  Nothing recorded for this month. Skipping.")
        return

    # ── Count merged PRs and contributors ────────────────────────────
    print("\n[2/5] Counting merged PRs and contributors...")
    merged = merged_prs(month, github_token, repository)
    contributors = rank_contributors(merged, github_token)
    print(f"  {len(merged)} merged PRs, {len(contributors)} contributors")

    # ── Generate summary ─────────────────────────────────────────────
    print("\n[3/5] Generating monthly summary...")
    digest = generate_digest(gists, month, pollinations_token)
    if not digest:
        print("  FATAL: Monthly digest generation failed")
        sys.exit(1)
    print(f"  Theme: {digest.get('theme', '')}")
    generated_at = datetime.now(timezone.utc).isoformat()
    selected = [{"number": gist.get("pr_number"), "date": (gist.get("merged_at") or "")[:10]} for gist in gists]
    summary_artifact = build_monthly_summary_artifact(
        digest, selected, month, merged, contributors, generated_at
    )

    # ── Generate the website post and its cover ──────────────────────
    print("\n[4/5] Generating the website page...")
    previous_page = read_previous_page(month)
    print(f"  Continues: {previous_page['period_start'][:7] if previous_page else 'nothing, page one'}")
    community = community_size(month, contributors)
    moved_in = ((previous_page or {}).get("metadata") or {}).get("residents") or []
    living = residents(moved_in, community)
    newcomer = living[-1] if len(living) > len(moved_in) else None
    print(f"  Residents: {', '.join(living)}{f' ({newcomer} moves in)' if newcomer else ''} · community {community}")
    moment = f"This page's moment: {MOMENTS[month[5:]] if previous_page else 'soft warm daylight'}."
    notes = community_context(len(contributors), len(merged), community, living, newcomer)
    post = generate_website_post(digest, pollinations_token, previous_page, f"{notes}\n\n{moment}")
    if not post:
        print("  FATAL: Monthly website post generation failed")
        sys.exit(1)
    missing = [field for field in ("title", "summary", "image_prompt", "story") if not post.get(field)]
    if missing:
        print(f"  FATAL: Monthly website post is missing {', '.join(missing)}")
        sys.exit(1)

    post["residents"] = living
    creatures = [name for name in living if "look" in RESIDENTS[name]]
    looks = "; ".join(f"{RESIDENTS[name]['name']}, {RESIDENTS[name]['look']}" for name in creatures)
    prompt = " ".join([
        post["image_prompt"],
        LANTERN_HILL,
        *([] if previous_page else [PAGE_ONE]),
        moment,
        f"The only characters on this page: {', '.join(RESIDENTS[name]['name'] for name in living)}.",
        *([f"{RESIDENTS[newcomer]['name'].capitalize()} has just arrived: it walks up the sandy path "
           "carrying a small bundle toward its own new spot, clearly visible in the scene, and the "
           "others turn to greet it."] if newcomer and previous_page else []),
        *([f"Attached after the character sheet, true to their look: {looks}."] if creatures else []),
        ONE_OF_EACH,
    ])
    limits = {**NO_CAST, **{RESIDENTS[name]["count"]: 1 for name in living}}
    references = [f"{CREATURES_URL}/{name}.png" for name in creatures]
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
