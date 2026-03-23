"""GitHub user validation for Seed tier eligibility.

Points-based validation formula with quality filtering:
  - GitHub account age: 0.5 pt/month (max 6, so 12 months to max)
  - Commits (1yr window): 0.1 pt each (max 3)
  - Public repos (quality only, diskUsage > 0): 0.5 pt each (max 1)
  - Stars (total across quality repos): 0.1 pt each (max 5)
  - Threshold: >= 6.5 pts

Quality filtering: empty repos (diskUsage == 0) are excluded from repo count
and star totals. Fraud detection flags burst-created empty repos, suspicious
star uniformity, and accounts dominated by empty repos.
"""

import json
import os
import time
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

from tqdm import tqdm

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
GITHUB_GRAPHQL = "https://api.github.com/graphql"
BATCH_SIZE = 25
MAX_BATCHES = None  # Set to a number to limit batches for testing

# Quality filtering: repos and stars are counted from quality repos only (diskUsage > 0).
# Scoring config: each metric has a multiplier and max points
# NOTE: If you update these values, also update enter.pollinations.ai/src/client/components/balance/tier-explanation.tsx
SCORING = [
    {
        "field": "age_days",
        "multiplier": 0.5 / 30,
        "max": 6.0,
    },  # 0.5pt/month, max 6 (12 months)
    {"field": "commits", "multiplier": 0.1, "max": 3.0},  # 0.1pt each, max 3 (1yr window)
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
THRESHOLD = 6.5


def build_query(usernames: list[str]) -> str:
    """Build GraphQL query for multiple users."""
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
        contributionsCollection {{ totalCommitContributions }}
    }}''')
    return f"query {{ {''.join(fragments)} }}"


def detect_fraud(all_nodes: list[dict], total_count: int) -> list[str]:
    """Detect gaming signals from repo data. Returns list of fraud flag strings."""
    flags = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)

    # 1. Burst empty repos: >= 5 repos created in last 7 days with diskUsage == 0
    burst_empty = 0
    for node in all_nodes:
        created = datetime.fromisoformat(node["createdAt"].replace("Z", "+00:00"))
        if created >= cutoff and node.get("diskUsage", 0) == 0:
            burst_empty += 1
    if burst_empty >= 5:
        flags.append("burst_empty_repos")

    # 2. Star uniformity: if 5+ starred repos share the same star count at > 60%
    #    Exclude star count of 1 (too common naturally for small legit projects)
    starred_counts = [
        node["stargazerCount"] for node in all_nodes if node["stargazerCount"] > 1
    ]
    if len(starred_counts) >= 5:
        counter = Counter(starred_counts)
        _, most_common_freq = counter.most_common(1)[0]
        if most_common_freq >= 5 and most_common_freq / len(starred_counts) > 0.6:
            flags.append("star_uniformity")

    # 3. Empty repo dominance: >= 5 fetched repos, > 80% empty, totalCount > 20
    quality_count = sum(1 for node in all_nodes if node.get("diskUsage", 0) > 0)
    if len(all_nodes) >= 5:
        empty_count = len(all_nodes) - quality_count
        if empty_count / len(all_nodes) > 0.8 and total_count > 20:
            flags.append("empty_repo_dominance")

    # 4. Repo quality gap: many total repos but almost none with code
    #    Catches gaming even when empty repos don't appear in top-by-stars
    if total_count > 20 and quality_count < 3:
        flags.append("repo_quality_gap")

    return flags


def score_user(data: dict | None, username: str) -> dict:
    """Calculate score for a single user. Returns dict with username, approved, reason."""
    if not data:
        return {
            "username": username,
            "approved": False,
            "reason": "User not found",
            "details": None,
        }

    created = datetime.fromisoformat(data["createdAt"].replace("Z", "+00:00"))
    age_days = (datetime.now(timezone.utc) - created).days

    # If nodes is null, GitHub hit RESOURCE_LIMITS_EXCEEDED — defer this user
    raw_nodes = data["repositories"].get("nodes")
    if raw_nodes is None and data["repositories"].get("totalCount", 0) > 0:
        return {
            "username": username,
            "approved": False,
            "reason": "Deferred (API resource limit, incomplete repo data)",
            "details": None,
        }

    all_nodes = [node for node in (raw_nodes or []) if node]
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

    # Fraud detection: reject if gaming signals found, regardless of score
    fraud_flags = detect_fraud(all_nodes, data["repositories"]["totalCount"])
    if fraud_flags:
        approved = False

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

    if fraud_flags:
        details["fraud_flags"] = fraud_flags

    reason = f"{total_score:.1f} pts"
    if fraud_flags:
        reason += f" [FRAUD: {', '.join(fraud_flags)}]"

    return {
        "username": username,
        "approved": approved,
        "reason": reason,
        "details": details,
    }


def fetch_batch(
    usernames: list[str], retries: int = 3
) -> tuple[list[dict], int | None]:
    """Fetch and score a batch of users with retry logic. Returns (results, rate_limit_remaining)."""
    query = build_query(usernames)
    request = urllib.request.Request(
        GITHUB_GRAPHQL,
        data=json.dumps({"query": query}).encode(),
        headers={
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Content-Type": "application/json",
        },
    )

    rate_remaining = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = json.loads(response.read())
                rate_remaining_header = response.headers.get("X-RateLimit-Remaining")
                if rate_remaining_header:
                    rate_remaining = int(rate_remaining_header)
            break
        except urllib.error.HTTPError as error:
            if attempt < retries - 1 and error.code in (502, 503, 504):
                time.sleep(5 * (attempt + 1))
                continue
            if attempt < retries - 1 and error.code in (403, 429):
                retry_after = error.headers.get("Retry-After")
                reset_at = error.headers.get("X-RateLimit-Reset")
                if retry_after:
                    wait = int(retry_after) + 1
                elif reset_at:
                    wait = max(int(reset_at) - int(time.time()), 0) + 1
                else:
                    wait = 60
                print(f"   ⏳ Rate limited (HTTP {error.code}), waiting {wait}s...")
                time.sleep(wait)
                continue
            raise

    # Check for RESOURCE_LIMITS_EXCEEDED errors
    resource_errors = [
        e for e in data.get("errors", [])
        if e.get("type") == "RESOURCE_LIMITS_EXCEEDED"
    ]
    if resource_errors:
        affected = {e["path"][0] for e in resource_errors if e.get("path")}
        print(f"   ⚠️  RESOURCE_LIMITS_EXCEEDED for {len(affected)} users in batch of {len(usernames)} — consider reducing BATCH_SIZE")

    results = []
    for i, username in enumerate(usernames):
        user_data = data.get("data", {}).get(f"u{i}")
        results.append(score_user(user_data, username))
    return results, rate_remaining


def validate_users(usernames: list[str]) -> list[dict]:
    """Validate users in concurrent batches."""
    if not usernames:
        return []

    batches = [
        usernames[i : i + BATCH_SIZE] for i in range(0, len(usernames), BATCH_SIZE)
    ]
    if MAX_BATCHES:
        batches = batches[:MAX_BATCHES]

    results = []
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
