"""GitHub user validation for Seed tier eligibility.

Points-based validation formula with quality filtering:
  - GitHub account age: 0.5 pt/month (max 6, so 12 months to max)
  - Commits (any repo): 0.1 pt each (max 2)
  - Public repos (quality only, diskUsage > 0): 0.5 pt each (max 1)
  - Stars (total across quality repos): 0.1 pt each (max 5)
  - Threshold: >= 8 pts

Quality filtering: empty repos (diskUsage == 0) are excluded from repo count
and star totals.

Risk assessment is tracked separately from the numeric score:
  - suspicious GitHub profile patterns do not change the score
  - they are exposed as risk_status / risk_flags for the orchestrators
"""

import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

from tqdm import tqdm
from github_risk import assess_profile_risk

# Import shared account validation utilities
sys.path.insert(0, __import__("os").path.join(__import__("os").path.dirname(__file__), "..", "shared"))
from github_account_validation import (
    BATCH_SIZE,
    GITHUB_USERNAME_RE,
    MAX_BATCHES,
    get_github_token,
    run_graphql_query,
    validate_account_records,
)

# Quality filtering: repos and stars are counted from quality repos only (diskUsage > 0).
# Scoring config: each metric has a multiplier and max points
# NOTE: If you update these values, also update enter.pollinations.ai/src/client/components/balance/tier-explanation.tsx
SCORING = [
    {
        "field": "age_days",
        "multiplier": 0.5 / 30,
        "max": 6.0,
    },  # 0.5pt/month, max 6 (12 months)
    {"field": "commits", "multiplier": 0.1, "max": 2.0},  # 0.1pt each, max 2
    {
        "field": "repos",
        "multiplier": 0.5,
        "max": 1.0,
    },  # 0.5pt each, max 1 (quality repos only)
    {
        "field": "stars",
        "multiplier": 0.1,
        "max": 5.0,
    },  # 0.1pt each, max 5 (quality repos only)
]
THRESHOLD = 8.0


def build_query(usernames: list[str]) -> str:
    """Build GraphQL query for multiple users."""
    from_date = (datetime.now(timezone.utc) - timedelta(days=90)).strftime(
        "%Y-%m-%dT00:00:00Z"
    )
    fragments = []
    for i, username in enumerate(usernames):
        safe_username = username.replace("\\", "\\\\").replace('"', '\\"')
        fragments.append(f'''
    u{i}: user(login: "{safe_username}") {{
        login
        createdAt
        repositories(privacy: PUBLIC, isFork: false, first: 10, orderBy: {{field: STARGAZERS, direction: DESC}}) {{
            totalCount
            nodes {{ stargazerCount diskUsage createdAt }}
        }}
        contributionsCollection(from: "{from_date}") {{ totalCommitContributions }}
    }}''')
    return f"query {{ {''.join(fragments)} }}"


def score_user(data: dict | None, username: str) -> dict:
    """Calculate score for a single user. Returns dict with username, approved, reason."""
    if not data:
        return {
            "username": username,
            "status": "github_account_deleted",
            "approved": False,
            "reason": "GitHub account deleted",
            "details": None,
            "risk_status": "unavailable",
            "risk_flags": [],
            "risk_details": None,
        }

    created = datetime.fromisoformat(data["createdAt"].replace("Z", "+00:00"))
    age_days = (datetime.now(timezone.utc) - created).days

    # Quality filtering: exclude None nodes and empty repos (diskUsage == 0)
    all_nodes = [node for node in (data["repositories"].get("nodes") or []) if node]
    quality_nodes = [node for node in all_nodes if node.get("diskUsage", 0) > 0]

    metrics = {
        "age_days": age_days,
        "repos": len(quality_nodes),
        "commits": data["contributionsCollection"]["totalCommitContributions"],
        "stars": sum(node["stargazerCount"] for node in quality_nodes),
    }

    # Calculate individual scores
    scores = {}
    for config in SCORING:
        field = config["field"]
        raw = metrics[field] * config["multiplier"]
        capped = min(raw, config["max"])
        scores[field] = capped

    total_score = sum(scores.values())
    approved = total_score >= THRESHOLD

    details = {
        "age_days": age_days,
        "age_pts": scores["age_days"],
        "quality_repos": len(quality_nodes),
        "total_repos": data["repositories"]["totalCount"],
        "total_fetched": len(all_nodes),
        "repos": metrics["repos"],
        "repos_pts": scores["repos"],
        "commits": metrics["commits"],
        "commits_pts": scores["commits"],
        "stars": metrics["stars"],
        "stars_pts": scores["stars"],
        "total": total_score,
    }

    reason = f"{total_score:.1f} pts"
    risk = assess_profile_risk(data, username)

    return {
        "username": username,
        "status": "ok",
        "approved": approved,
        "reason": reason,
        "details": details,
        "risk_status": risk["risk_status"],
        "risk_flags": risk["risk_flags"],
        "risk_details": risk["risk_details"],
    }


def fetch_batch(
    usernames: list[str], retries: int = 3
) -> tuple[list[dict], int | None]:
    """Fetch and score a batch of users with retry logic. Returns (results, rate_limit_remaining)."""
    data, rate_remaining = run_graphql_query(build_query(usernames), retries)

    results = []
    for i, username in enumerate(usernames):
        user_data = data.get("data", {}).get(f"u{i}")
        results.append(score_user(user_data, username))
    return results, rate_remaining


def _score_usernames(usernames: list[str]) -> list[dict]:
    """Validate users in concurrent batches."""
    if not usernames:
        return []

    get_github_token()

    invalid_results = [
        score_user(None, username)
        for username in usernames
        if not GITHUB_USERNAME_RE.match(username)
    ]
    valid_usernames = [
        username for username in usernames if GITHUB_USERNAME_RE.match(username)
    ]

    if not valid_usernames:
        return invalid_results

    batches = [
        valid_usernames[i : i + BATCH_SIZE]
        for i in range(0, len(valid_usernames), BATCH_SIZE)
    ]
    if MAX_BATCHES:
        batches = batches[:MAX_BATCHES]

    results = invalid_results.copy()
    approved_count = 0

    progress_bar = tqdm(
        total=len(batches),
        desc="Validating",
        unit="batch",
        bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{remaining}] {postfix}",
    )

    # Use 3 concurrent workers to stay well under API limits
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(fetch_batch, batch): i for i, batch in enumerate(batches)
        }

        for future in as_completed(futures):
            batch_results, rate_remaining = future.result()
            results.extend(batch_results)
            approved_count += sum(1 for r in batch_results if r["approved"])
            approval_rate = 100 * approved_count / len(results)
            progress_bar.set_postfix(
                seed=f"{approval_rate:.0f}%", quota=rate_remaining or "?"
            )
            progress_bar.update(1)

            # Adaptive rate limiting: go fast when quota is healthy
            if rate_remaining is not None and rate_remaining <= 100:
                time.sleep(1 if rate_remaining > 50 else 2)
            elif rate_remaining is None:
                time.sleep(2)  # Conservative fallback

    progress_bar.close()
    return results


def validate_user_records(records: list[dict]) -> list[dict]:
    if not records:
        return []

    account_results = validate_account_records(records)
    score_targets = [
        result["username"]
        for result in account_results
        if result.get("status") == "ok" and isinstance(result.get("username"), str)
    ]
    score_results = _score_usernames(score_targets)
    score_results_by_username = {
        result["username"]: result
        for result in score_results
        if isinstance(result.get("username"), str)
    }

    merged_results = []
    for account_result in account_results:
        username = account_result.get("username")
        github_id = account_result.get("github_id")
        if account_result.get("status") != "ok" or not isinstance(username, str):
            deleted_result = score_user(None, username or "")
            deleted_result["github_id"] = github_id
            deleted_result["username"] = username
            merged_results.append(deleted_result)
            continue

        scored = score_results_by_username.get(username)
        if scored is None:
            unavailable_result = score_user(None, username)
            unavailable_result["github_id"] = github_id
            unavailable_result["username"] = username
            merged_results.append(unavailable_result)
            continue

        merged_results.append(
            {
                **scored,
                "github_id": github_id,
            }
        )

    return merged_results
