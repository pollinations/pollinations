"""GitHub user validation for Seed tier eligibility.

Points-based validation formula with quality filtering:
  - GitHub account age: 0.5 pt/month (max 6, so 12 months to max)
  - Commits (90-day window): 0.1 pt each (max 3)
  - Public repos (quality only, diskUsage > 0): 0.5 pt each (max 1)
  - Stars (total across quality repos): 0.1 pt each (max 5)
  - Threshold: >= 7.0 pts

Quality filtering: empty repos (diskUsage == 0) are excluded from repo count
and star totals.

Lookup strategy: github_id → REST /user/:id (get node_id) → GraphQL node(id:)
No username dependency — works even if users rename their GitHub account.
"""

import json
import os
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

from tqdm import tqdm

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
GITHUB_GRAPHQL = "https://api.github.com/graphql"
GITHUB_REST_USER = "https://api.github.com/user"
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
    {"field": "commits", "multiplier": 0.1, "max": 3.0},  # 0.1pt each, max 3 (90-day window)
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
THRESHOLD = 7.0


def _github_rest_request(url: str, retries: int = 3) -> tuple[dict | None, int]:
    """Make a GitHub REST API request. Returns (data, http_status)."""
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept": "application/vnd.github+json",
        },
    )
    last_error = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.loads(response.read()), response.status
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None, 404
            if error.code == 401:
                raise RuntimeError("GitHub REST auth failed (HTTP 401) — check GITHUB_TOKEN")
            if attempt < retries - 1 and error.code in (502, 503, 504):
                time.sleep(5 * (attempt + 1))
                last_error = error
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
                print(f"   ⏳ REST rate limited (HTTP {error.code}), waiting {wait}s...")
                time.sleep(wait)
                last_error = error
                continue
            return None, error.code
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last_error = error
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
    raise RuntimeError(f"GitHub REST request failed after {retries} retries: {last_error}")


def lookup_accounts(github_ids: list[int]) -> list[dict]:
    """Resolve github_ids to node_ids via REST GET /user/:id.

    Returns list of {github_id, node_id, status} dicts.
    status is 'ok', 'deleted', or 'unavailable'.
    """
    results = [None] * len(github_ids)

    def _lookup(index_and_gid):
        index, gid = index_and_gid
        data, status = _github_rest_request(f"{GITHUB_REST_USER}/{gid}")
        if status == 200 and data and data.get("node_id"):
            return index, {
                "github_id": gid,
                "node_id": data["node_id"],
                "login": data.get("login"),
                "status": "ok",
            }
        if status == 404:
            return index, {
                "github_id": gid,
                "node_id": None,
                "login": None,
                "status": "deleted",
            }
        return index, {
            "github_id": gid,
            "node_id": None,
            "login": None,
            "status": "unavailable",
        }

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(_lookup, (i, gid)): i
            for i, gid in enumerate(github_ids)
        }
        for future in as_completed(futures):
            index, result = future.result()
            results[index] = result

    return results


def build_query(accounts: list[dict]) -> str:
    """Build GraphQL query using node(id:) for multiple users."""
    # 90-day window for commit contributions
    from_ts = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%dT00:00:00Z")

    fragments = []
    for i, account in enumerate(accounts):
        safe_node_id = account["node_id"].replace("\\", "\\\\").replace('"', '\\"')
        fragments.append(f'''
    u{i}: node(id: "{safe_node_id}") {{
        __typename
        ... on User {{
            createdAt
            repositories(privacy: PUBLIC, isFork: false, first: 10, orderBy: {{field: STARGAZERS, direction: DESC}}) {{
                totalCount
                nodes {{ stargazerCount diskUsage createdAt }}
            }}
            contributionsCollection(from: "{from_ts}") {{ totalCommitContributions }}
        }}
    }}''')
    return f"query {{ {''.join(fragments)} }}"


def score_user(data: dict | None, github_id: int) -> dict:
    """Calculate score for a single user. Returns dict with github_id, approved, reason."""
    if not data or data.get("__typename") != "User":
        return {
            "github_id": github_id,
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
            "github_id": github_id,
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

    return {
        "github_id": github_id,
        "approved": approved,
        "reason": f"{total_score:.1f} pts",
        "details": details,
    }


def fetch_graphql_batch(
    accounts: list[dict], retries: int = 3
) -> tuple[list[dict], int | None]:
    """Fetch and score a batch of accounts via GraphQL node(id:). Returns (results, rate_limit_remaining)."""
    query = build_query(accounts)
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
        print(f"   ⚠️  RESOURCE_LIMITS_EXCEEDED for {len(affected)} users in batch of {len(accounts)}")

    results = []
    for i, account in enumerate(accounts):
        user_data = data.get("data", {}).get(f"u{i}")
        results.append(score_user(user_data, account["github_id"]))
    return results, rate_remaining


def validate_users(github_ids: list[int]) -> list[dict]:
    """Validate users by github_id. Two-phase: REST lookup → GraphQL scoring."""
    if not github_ids:
        return []

    # Phase A: REST lookup to get node_ids
    print(f"   Looking up {len(github_ids)} accounts via REST...")
    accounts = lookup_accounts(github_ids)

    deleted = [a for a in accounts if a["status"] == "deleted"]
    unavailable = [a for a in accounts if a["status"] == "unavailable"]
    scoreable = [a for a in accounts if a["status"] == "ok"]

    if deleted:
        print(f"   Deleted accounts: {len(deleted)}")
    if unavailable:
        print(f"   Unavailable accounts: {len(unavailable)}")

    # Fail loudly if too many REST lookups failed — likely auth or GitHub outage
    unavailable_pct = len(unavailable) / len(github_ids) * 100 if github_ids else 0
    if len(unavailable) > 5 and unavailable_pct > 50:
        raise RuntimeError(
            f"REST lookup failure rate too high: {len(unavailable)}/{len(github_ids)} "
            f"({unavailable_pct:.0f}%) unavailable — likely auth error or GitHub outage"
        )

    # Build results for non-scoreable accounts
    results = []
    for a in deleted:
        results.append({
            "github_id": a["github_id"],
            "login": a.get("login"),
            "approved": False,
            "reason": "GitHub account deleted",
            "details": None,
        })
    for a in unavailable:
        results.append({
            "github_id": a["github_id"],
            "login": a.get("login"),
            "approved": False,
            "reason": "GitHub account unavailable",
            "details": None,
        })

    if not scoreable:
        return results

    # Phase B: GraphQL scoring in batches
    batches = [
        scoreable[i : i + BATCH_SIZE] for i in range(0, len(scoreable), BATCH_SIZE)
    ]
    if MAX_BATCHES:
        batches = batches[:MAX_BATCHES]

    # Map github_id → login from REST response for display
    id_to_login = {a["github_id"]: a.get("login") for a in scoreable}

    approved_count = 0
    scored_results = []

    progress_bar = tqdm(
        total=len(batches),
        desc="Scoring",
        unit="batch",
        bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{remaining}] {postfix}",
    )

    # Use 3 concurrent workers to stay well under API limits
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(fetch_graphql_batch, batch): i for i, batch in enumerate(batches)
        }

        for future in as_completed(futures):
            batch_results, rate_remaining = future.result()
            # Attach login from REST response for display purposes
            for r in batch_results:
                r["login"] = id_to_login.get(r["github_id"])
            scored_results.extend(batch_results)
            approved_count += sum(1 for r in batch_results if r["approved"])
            total_so_far = len(scored_results)
            approval_rate = 100 * approved_count / total_so_far if total_so_far else 0
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
    results.extend(scored_results)
    return results
