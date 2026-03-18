"""GitHub profile risk assessment for seed eligibility.

This module is intentionally separate from the numeric developer score.
It flags suspicious GitHub profile construction patterns that should block a
seed promotion while still allowing the user to remain at spore.
"""

from datetime import datetime, timedelta, timezone

RECENT_EMPTY_REPO_WINDOW_DAYS = 7
BURST_EMPTY_REPO_THRESHOLD = 5
EMPTY_REPO_DOMINANCE_MIN_TOTAL_REPOS = 20
EMPTY_REPO_DOMINANCE_THRESHOLD = 0.8
MIN_QUALITY_REPOS_FOR_LARGE_ACCOUNT = 3


def _parse_github_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def assess_profile_risk(data: dict | None, username: str) -> dict:
    if not data:
        return {
            "username": username,
            "risk_status": "unavailable",
            "risk_flags": [],
            "risk_details": None,
        }

    repositories = data.get("repositories") or {}
    all_nodes = [node for node in (repositories.get("nodes") or []) if node]
    empty_nodes = [node for node in all_nodes if node.get("diskUsage", 0) == 0]
    quality_nodes = [node for node in all_nodes if node.get("diskUsage", 0) > 0]
    total_repos = int(repositories.get("totalCount") or 0)

    recent_cutoff = datetime.now(timezone.utc) - timedelta(
        days=RECENT_EMPTY_REPO_WINDOW_DAYS
    )
    recent_empty_repos = 0
    for node in empty_nodes:
        created_at = _parse_github_datetime(node.get("createdAt"))
        if created_at and created_at >= recent_cutoff:
            recent_empty_repos += 1

    flags: list[str] = []
    fetched_repos = len(all_nodes)
    empty_ratio = len(empty_nodes) / fetched_repos if fetched_repos else 0.0

    if recent_empty_repos >= BURST_EMPTY_REPO_THRESHOLD:
        flags.append("burst_empty_repos")
    if (
        total_repos > EMPTY_REPO_DOMINANCE_MIN_TOTAL_REPOS
        and fetched_repos > 0
        and empty_ratio > EMPTY_REPO_DOMINANCE_THRESHOLD
    ):
        flags.append("empty_repo_dominance")
    if total_repos > EMPTY_REPO_DOMINANCE_MIN_TOTAL_REPOS and len(quality_nodes) < (
        MIN_QUALITY_REPOS_FOR_LARGE_ACCOUNT
    ):
        flags.append("repo_quality_gap")

    return {
        "username": username,
        "risk_status": "suspicious" if flags else "ok",
        "risk_flags": flags,
        "risk_details": {
            "total_repos": total_repos,
            "fetched_repos": fetched_repos,
            "empty_fetched_repos": len(empty_nodes),
            "quality_fetched_repos": len(quality_nodes),
            "recent_empty_repos": recent_empty_repos,
        },
    }
