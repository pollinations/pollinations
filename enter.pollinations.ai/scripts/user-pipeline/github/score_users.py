"""GitHub user validation for Seed tier eligibility.

Points-based validation formula with quality filtering:
  - GitHub account age: 0.5 pt/month (max 6, so 12 months to max)
  - Commits (any repo): 0.1 pt each (max 2)
  - Public repos (quality only, diskUsage > 0): 0.5 pt each (max 1)
  - Stars (total across quality repos): 0.1 pt each (max 5)
  - Threshold: >= 8 pts

Quality filtering: empty repos (diskUsage == 0) are excluded from repo count
and star totals.
"""

import base64
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

from tqdm import tqdm

GITHUB_GRAPHQL = "https://api.github.com/graphql"
BATCH_SIZE = 50
MAX_BATCHES = None  # Set to a number to limit batches for testing
GITHUB_USERNAME_RE = re.compile(r"^[A-Za-z0-9-]+$")
_AUTH_MODE = None
_APP_TOKEN = None
_APP_TOKEN_EXPIRES_AT = 0
_APP_TOKEN_LOCK = threading.Lock()

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


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _generate_app_jwt(app_id: str, key_path: str) -> str:
    now = int(time.time())
    header = _base64url_encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    payload = _base64url_encode(
        json.dumps(
            {
                "iat": now - 60,
                "exp": now + 10 * 60,
                "iss": app_id,
            }
        ).encode()
    )
    signing_input = f"{header}.{payload}".encode()
    signature = subprocess.run(
        ["openssl", "dgst", "-binary", "-sha256", "-sign", key_path],
        input=signing_input,
        capture_output=True,
        check=True,
    ).stdout
    return f"{header}.{payload}.{_base64url_encode(signature)}"


def _fetch_app_token(app_id: str, key_path: str) -> tuple[str, int]:
    jwt = _generate_app_jwt(app_id, key_path)

    installations_request = urllib.request.Request(
        "https://api.github.com/app/installations",
        headers={
            "Authorization": f"Bearer {jwt}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "pollinations-github-validator",
        },
    )
    with urllib.request.urlopen(installations_request, timeout=30) as response:
        installations = json.loads(response.read())

    if not installations:
        raise RuntimeError("No GitHub App installations found")

    installation_id = installations[0]["id"]
    token_request = urllib.request.Request(
        f"https://api.github.com/app/installations/{installation_id}/access_tokens",
        data=b"{}",
        headers={
            "Authorization": f"Bearer {jwt}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "pollinations-github-validator",
        },
        method="POST",
    )
    with urllib.request.urlopen(token_request, timeout=30) as response:
        token_data = json.loads(response.read())

    expires_at = int(
        datetime.fromisoformat(token_data["expires_at"].replace("Z", "+00:00")).timestamp()
    )
    return token_data["token"], expires_at - 5 * 60


def get_github_token() -> str:
    global _AUTH_MODE, _APP_TOKEN, _APP_TOKEN_EXPIRES_AT

    app_id = os.environ.get("GITHUB_APP_ID")
    key_path = os.environ.get("GITHUB_APP_PRIVATE_KEY_PATH")
    if app_id or key_path:
        if not app_id or not key_path:
            raise RuntimeError(
                "Set both GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH for GitHub App auth"
            )
        if not os.path.exists(key_path):
            raise RuntimeError(f"GitHub App private key not found: {key_path}")

        with _APP_TOKEN_LOCK:
            if _APP_TOKEN and time.time() < _APP_TOKEN_EXPIRES_AT:
                return _APP_TOKEN

            _APP_TOKEN, _APP_TOKEN_EXPIRES_AT = _fetch_app_token(app_id, key_path)
            if _AUTH_MODE != "app":
                print(
                    f"🔑 Using GitHub App auth via {os.path.basename(key_path)}",
                    file=sys.stderr,
                )
                _AUTH_MODE = "app"
            return _APP_TOKEN

    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise RuntimeError(
            "Set GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY_PATH or GITHUB_TOKEN"
        )
    if _AUTH_MODE != "pat":
        print("🔑 Using GITHUB_TOKEN auth", file=sys.stderr)
        _AUTH_MODE = "pat"
    return token


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

    return {
        "username": username,
        "status": "ok",
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
            "Authorization": f"Bearer {get_github_token()}",
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

    results = []
    for i, username in enumerate(usernames):
        user_data = data.get("data", {}).get(f"u{i}")
        results.append(score_user(user_data, username))
    return results, rate_remaining


def validate_users(usernames: list[str]) -> list[dict]:
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
