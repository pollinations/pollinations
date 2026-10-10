#!/usr/bin/env python3
"""
Tier 4: Monthly Website Page

1st of the month, 06:00 UTC:
  1. Read the past month's gists (daily summaries for months before gists began)
  2. Count the month's merged PRs and contributors on GitHub
  3. AI synthesizes the month's themes
  4. Generate the website post: title, summary, cover prompt and story
  5. Generate one cover that continues the previous month's cover
  6. Commit everything directly to the news branch

The website's build diary reads it through index.json (build_news_index.py).

See operations/social/PIPELINE.md for full architecture.
"""

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
    get_post_image_urls,
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
COVER_WIDTH, COVER_HEIGHT = 2048, 1152  # 16:9, beside the text on the website
CONTINUE_COVER = (
    "The second attached image is last month's cover: keep its place, viewpoint, "
    "palette and characters, and show what changed since."
)

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
    """The month's daily summaries: the record for months before PR gists began (Feb 2026)."""
    daily_root = Path(repo_root or get_repo_root()) / DAILY_REL_DIR
    return [
        json.loads(path.read_text(encoding="utf-8"))
        for path in sorted(daily_root.glob(f"{month}-*/summary.json"))
    ]


def read_previous_page(month: str, repo_root: Optional[str] = None) -> Optional[Dict]:
    """The latest website page before `month`, so a missed month never restarts the story."""
    monthly_root = Path(repo_root or get_repo_root()) / MONTHLY_REL_DIR
    pages = sorted(path for path in monthly_root.glob("*/website.json") if path.parent.name < month)
    return json.loads(pages[-1].read_text(encoding="utf-8")) if pages else None


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


def generate_website_post(digest: Dict, token: str, previous_page: Optional[Dict]) -> Optional[Dict]:
    return generate_platform_post(
        "website", digest, token,
        "Write this month's page of the website build diary.",
        extra_context=story_context(previous_page),
    )


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
    daily_summaries = [] if gists else read_daily_summaries(month)
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
    previous_page = read_previous_page(month)
    print(f"  Continues: {previous_page['period_start'][:7] if previous_page else 'nothing, page one'}")
    post = generate_website_post(digest, pollinations_token, previous_page)
    if not post:
        print("  FATAL: Monthly website post generation failed")
        sys.exit(1)
    missing = [field for field in ("title", "summary", "image_prompt", "story") if not post.get(field)]
    if missing:
        print(f"  FATAL: Monthly website post is missing {', '.join(missing)}")
        sys.exit(1)

    previous_cover = get_post_image_urls(previous_page)[:1] if previous_page else []
    prompt = f"{post['image_prompt']} {CONTINUE_COVER}" if previous_cover else post["image_prompt"]
    image_bytes, _ = generate_image(
        prompt, pollinations_token, COVER_WIDTH, COVER_HEIGHT, references=previous_cover
    )
    if not image_bytes:
        print("  FATAL: Monthly cover generation failed")
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
