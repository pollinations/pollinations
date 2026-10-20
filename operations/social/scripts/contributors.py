#!/usr/bin/env python3
"""Merged PRs per GitHub account for one month: the monthly job's data/contributors/<month>.json.

Every PR merged into main or master counts once; its author and each noreply co-author
get credit, keyed by GitHub account id so a rename never splits anyone's count.
"""

import re
from datetime import date, timedelta
from functools import lru_cache
from typing import Dict, List, Optional

from common import GITHUB_API_BASE, _github_headers, github_api_request, month_dates

# Every PR merged into main or master by anyone, agents and bots included. Work merged
# into master until November 2025, and master still takes the odd PR.
MERGED_BASES = ("main", "master")
SEARCH_CAP = 1000  # GitHub search returns at most this many results per query
SEARCH_QUERY = """
query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number
        mergedAt
        author { __typename login avatarUrl(size: 80) url ... on User { databaseId } ... on Bot { databaseId } }
        mergeCommit { message }
      }
    }
  }
}
"""
# Co-authored-by trailers with a GitHub noreply address name the account:
# "Name <12345+login@users.noreply.github.com>". Bot accounts ("login[bot]@…") don't match.
# Git names team members commit under that are a different GitHub user's login.
GIT_ALIASES = {
    "thomash": "voodoohop"
}  # Thomas Haferlach; github.com/ThomasH is someone else
NOREPLY_COAUTHOR = re.compile(
    r"^co-authored-by:[^<\n]*<(?:(\d+)\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com>",
    re.IGNORECASE | re.MULTILINE,
)


def search_prs(query: str, token: str, document: str = SEARCH_QUERY) -> List[Dict]:
    """All PRs a GitHub search matches, with the fields `document` asks for; fails over the
    search cap rather than miss some."""
    nodes, after = [], None
    while True:
        response = github_api_request(
            "POST",
            f"{GITHUB_API_BASE}/graphql",
            headers=_github_headers(token),
            json={"query": document, "variables": {"q": query, "after": after}},
        )
        payload = response.json()
        if response.status_code != 200 or payload.get("errors"):
            raise RuntimeError(
                f"GitHub search failed: {response.status_code} {payload.get('errors')}"
            )
        search = payload["data"]["search"]
        if search["issueCount"] > SEARCH_CAP:
            raise RuntimeError(
                f"{query} matches {search['issueCount']} PRs, over the search cap"
            )
        nodes.extend(node for node in search["nodes"] if node)
        if not search["pageInfo"]["hasNextPage"]:
            return nodes
        after = search["pageInfo"]["endCursor"]


def merged_prs(month: str, token: str, repository: str) -> List[Dict]:
    """Every PR merged into main or master in the month, a week at a time to stay under the cap."""
    start, end = (date.fromisoformat(day) for day in month_dates(month))
    prs = {}
    while start <= end:
        stop = min(start + timedelta(days=6), end)
        for base in MERGED_BASES:
            query = (
                f"repo:{repository} is:pr is:merged base:{base} merged:{start}..{stop}"
            )
            prs.update((pr["number"], pr) for pr in search_prs(query, token))
        start = stop + timedelta(days=1)
    return list(prs.values())


@lru_cache(maxsize=None)
def github_account(path: str, token: str) -> Optional[Dict]:
    """A GitHub account by `user/<id>` or `users/<login>`; None only when GitHub says it does
    not exist. Any other failure (a rate limit, an outage) stops the run rather than dropping
    someone's credit."""
    response = github_api_request(
        "GET", f"{GITHUB_API_BASE}/{path}", headers=_github_headers(token)
    )
    if response.status_code == 404:
        return None
    if response.status_code != 200:
        raise RuntimeError(
            f"GitHub {path}: {response.status_code} {response.text[:200]}"
        )
    return response.json()


def coauthor(user_id: str, login: str, merged_at: str, token: str) -> Optional[Dict]:
    """The person behind a noreply co-author trailer, or None. Agent-written trailers sometimes
    pair a login with someone else's id, so the id counts only if it belongs to that login, or
    to a renamed account whose old login is gone. A trailer without an id (app submissions
    name the submitter that way) credits the account holding that login, if it already
    existed when the PR merged; a name taken later belongs to someone else. Bots get credit
    as PR authors only, so a trailer naming an app's own bot (by its id, with or without
    "[bot]") is skipped; organisations, placeholders and deleted accounts get no credit."""
    if not user_id:
        person = github_account(f"users/{GIT_ALIASES.get(login.lower(), login)}", token)
        if (
            person
            and person.get("type") == "User"
            and person["created_at"] <= merged_at
        ):
            return person
        return None
    by_id = github_account(f"user/{user_id}", token)
    if (
        by_id
        and by_id.get("type") == "Bot"
        and by_id["login"].lower().removesuffix("[bot]") == login.lower()
    ):
        return None
    person = by_id if by_id and by_id.get("type") == "User" else None
    if person and person["login"].lower() == login.lower():
        return person
    by_login = github_account(f"users/{login}", token)
    if (
        by_login and by_login.get("type") == "User"
    ):  # the trailer's id was wrong: credit the login
        return by_login
    return person  # renamed since (the old login is gone or now an organisation): the id is right


def rank_contributors(prs: List[Dict], token: str) -> List[Dict]:
    """Merged PRs per GitHub account id, which stays the same when an account is renamed:
    authors (people, agents and bots) plus noreply co-authors."""
    people = {}
    for pr in prs:
        accounts = {}
        author = pr.get("author") or {}  # null for deleted accounts
        if author.get("databaseId"):
            # Bots under GitHub's own login ("name[bot]"), linking to their app page, as the
            # repository's contributor list shows them.
            login = author["login"]
            if author.get("__typename") == "Bot":
                login = f"{login.removesuffix('[bot]')}[bot]"
            accounts[author["databaseId"]] = (
                login,
                author.get("avatarUrl"),
                author.get("url"),
            )
        message = (pr.get("mergeCommit") or {}).get("message") or ""
        for user_id, login in NOREPLY_COAUTHOR.findall(message):
            person = coauthor(user_id, login, pr.get("mergedAt") or "", token)
            if person:
                accounts.setdefault(
                    person["id"],
                    (person["login"], person.get("avatar_url"), person.get("html_url")),
                )
        for user_id, (login, avatar_url, url) in accounts.items():
            person = people.setdefault(
                user_id,
                {
                    "id": user_id,
                    "login": login,
                    "avatar_url": avatar_url
                    or f"https://avatars.githubusercontent.com/u/{user_id}?s=80",
                    "url": url or f"https://github.com/{login}",
                    "prs": 0,
                },
            )
            person["prs"] += 1
    return sorted(
        people.values(), key=lambda person: (-person["prs"], person["login"].lower())
    )


def month_counts(month: str, token: str, repository: str) -> Dict:
    """The month's merged PRs and who made them, as data/contributors/<month>.json."""
    merged = merged_prs(month, token, repository)
    return {
        "month": month,
        "merged_prs": len(merged),
        "contributors": rank_contributors(merged, token),
    }
