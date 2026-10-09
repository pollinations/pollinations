#!/usr/bin/env python3
"""Publish the website's contributor wall and build-diary counts.

Writes two small public files to the news branch, which the website reads:

- site/contributors.json: everyone whose pull request was merged in the last
  12 months, people and agents alike, plus the people named in
  Co-authored-by trailers (community app submissions arrive that way).
- site/build-diary.json: merged pull requests per month since 2025-01, with
  that month's build-diary write-up when one exists.

A merged pull request counts whatever branch it landed on, except release
pull requests into production: they copy work already merged into main.
"""

import calendar
import json
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Optional

from common import (
    GISTS_BRANCH,
    GITHUB_API_BASE,
    NEWS_REL_DIR,
    _github_headers,
    commit_files_to_branch,
    get_env,
    get_repo_root,
    github_api_request,
)

SITE_REL_DIR = f"{NEWS_REL_DIR}/site"
MONTHLY_REL_DIR = f"{NEWS_REL_DIR}/monthly"
RAW_NEWS_BASE = "https://raw.githubusercontent.com/pollinations/pollinations/news"
DIARY_FROM = "2025-01"
CONTRIBUTOR_DAYS = 365
TOP_CONTRIBUTORS = 100
MERGED = "is:pr is:merged -base:production"

SEARCH_QUERY = """
query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number
        body
        author { login avatarUrl(size: 80) url }
      }
    }
  }
}
"""

# Co-authored-by: name <12345+login@users.noreply.github.com> (or login@...).
NOREPLY = re.compile(
    r"^co-authored-by:[^<\n]*<(?:\d+\+)?([A-Za-z0-9-]+(?:\[bot\])?)@users\.noreply\.github\.com>",
    re.IGNORECASE | re.MULTILINE,
)


def graphql(token: str, query: str, variables: Dict) -> Dict:
    response = github_api_request(
        "POST",
        f"{GITHUB_API_BASE}/graphql",
        headers=_github_headers(token),
        json={"query": query, "variables": variables},
    )
    payload = response.json()
    if response.status_code != 200 or payload.get("errors"):
        raise RuntimeError(f"GitHub GraphQL failed: {response.status_code} {payload.get('errors')}")
    return payload["data"]


def search_prs(token: str, query: str) -> Iterator[Dict]:
    after = None
    while True:
        result = graphql(token, SEARCH_QUERY, {"q": query, "after": after})["search"]
        yield from (node for node in result["nodes"] if node)
        if not result["pageInfo"]["hasNextPage"]:
            return
        after = result["pageInfo"]["endCursor"]


def count_prs(token: str, query: str) -> int:
    count_query = "query($q: String!) { search(query: $q, type: ISSUE, first: 1) { issueCount } }"
    return graphql(token, count_query, {"q": query})["search"]["issueCount"]


def windows(start: date, end: date, days: int = 14) -> Iterator[tuple[date, date]]:
    """Inclusive date ranges small enough to stay under search's 1,000-result cap."""
    while start <= end:
        stop = min(start + timedelta(days=days - 1), end)
        yield start, stop
        start = stop + timedelta(days=1)


def months_since(first: str, today: date) -> List[str]:
    """Every finished month from `first` (YYYY-MM) to last month."""
    months = []
    year, month = (int(part) for part in first.split("-"))
    while (year, month) < (today.year, today.month):
        months.append(f"{year}-{month:02d}")
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return months


def coauthor_logins(body: Optional[str]) -> set[str]:
    return set(NOREPLY.findall(body or ""))


def rank_contributors(prs: Iterable[Dict], limit: int = TOP_CONTRIBUTORS) -> List[Dict]:
    """Merged PRs per account: authored plus co-authored, highest first."""
    people: Dict[str, Dict] = {}

    def person(login: str, avatar: Optional[str] = None, url: Optional[str] = None) -> Dict:
        key = login.lower()
        if key not in people:
            people[key] = {
                "login": login,
                "avatar_url": avatar or f"https://github.com/{login}.png?size=80",
                "url": url or f"https://github.com/{login}",
                "prs": 0,
            }
        return people[key]

    for pr in prs:
        author = pr.get("author") or {}
        login = author.get("login")
        if login:
            person(login, author.get("avatarUrl"), author.get("url"))["prs"] += 1
        for coauthor in coauthor_logins(pr.get("body")):
            if coauthor.lower() != (login or "").lower():
                person(coauthor)["prs"] += 1

    ranked = sorted(people.values(), key=lambda p: (-p["prs"], p["login"].lower()))
    return ranked[:limit]


def read_write_up(month: str, repo_root: Path) -> Optional[Dict]:
    path = repo_root / MONTHLY_REL_DIR / month / "summary.json"
    try:
        summary = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not summary.get("title"):
        return None
    return {
        "title": summary["title"],
        "summary": summary.get("summary", ""),
        "image": f"{RAW_NEWS_BASE}/{MONTHLY_REL_DIR}/{month}/images/cover.jpg",
    }


def build_diary_rows(counts: Dict[str, int], write_ups: Dict[str, Optional[Dict]]) -> List[Dict]:
    return [
        {"month": month, "merged": counts[month], **(write_ups.get(month) or {})}
        for month in sorted(counts)
    ]


def main() -> None:
    print("=== Website stats ===")
    token = get_env("GITHUB_TOKEN")
    repository = get_env("GITHUB_REPOSITORY")
    owner, repo = repository.split("/")
    today = datetime.now(timezone.utc).date()
    generated_at = datetime.now(timezone.utc).isoformat()
    repo_root = Path(get_repo_root())

    since = today - timedelta(days=CONTRIBUTOR_DAYS)
    prs = [
        pr
        for start, stop in windows(since, today)
        for pr in search_prs(token, f"repo:{repository} {MERGED} merged:{start}..{stop}")
    ]
    contributors = rank_contributors(prs)
    print(f"  {len(prs)} merged PRs since {since}, {len(contributors)} contributors")

    counts = {}
    for month in months_since(DIARY_FROM, today):
        year, number = (int(part) for part in month.split("-"))
        last_day = calendar.monthrange(year, number)[1]
        counts[month] = count_prs(
            token, f"repo:{repository} {MERGED} merged:{month}-01..{month}-{last_day:02d}"
        )
    diary = build_diary_rows(counts, {m: read_write_up(m, repo_root) for m in counts})
    print(f"  Build diary: {len(diary)} months")

    ok = commit_files_to_branch(
        [
            (
                f"{SITE_REL_DIR}/contributors.json",
                {"generated_at": generated_at, "since": since.isoformat(), "contributors": contributors},
            ),
            (f"{SITE_REL_DIR}/build-diary.json", {"generated_at": generated_at, "months": diary}),
        ],
        GISTS_BRANCH,
        token,
        owner,
        repo,
        label=f"for website stats {today}",
    )
    if not ok:
        raise SystemExit("FATAL: website stats commit failed")


if __name__ == "__main__":
    main()
