"""GitHub user validation for Seed tier eligibility.

Points-based validation formula:
  - GitHub account age: 0.5 pt/month (max 6, so 12 months to max)
  - Commits (any repo): 0.1 pt each (max 2)
  - Public repos: 0.5 pt each (max 1)
  - Stars (total across repos): 0.1 pt each (max 5)
  - Threshold: >= 8 pts
"""

import json
import os
import random
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

from tqdm import tqdm

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
GITHUB_GRAPHQL = "https://api.github.com/graphql"
BATCH_SIZE = 50
MAX_BATCHES = None  # Set to a number to limit batches for testing

# Scoring config: each metric has a multiplier and max points
# NOTE: If you update these values, also update enter.pollinations.ai/src/client/components/tier-explanation.tsx
SCORING = [
    {"field": "age_days", "multiplier": 0.5/30, "max": 6.0},  # 0.5pt/month, max 6 (12 months)
    {"field": "commits",  "multiplier": 0.1,    "max": 2.0},  # 0.1pt each, max 2
    {"field": "repos",    "multiplier": 0.5,    "max": 1.0},  # 0.5pt each, max 1
    {"field": "stars",    "multiplier": 0.1,    "max": 5.0},  # 0.1pt each, max 5
]
THRESHOLD = 8.0


def build_query(usernames: list[str]) -> str:
    """Build GraphQL query for multiple users."""
    fragments = []
    for i, username in enumerate(usernames):
        safe_username = username.replace('"', '\\"').replace("\\", "\\\\")
        fragments.append(f'''
    u{i}: user(login: "{safe_username}") {{
        login
        createdAt
        repositories(privacy: PUBLIC, isFork: false, first: 5, orderBy: {{field: STARGAZERS, direction: DESC}}) {{
            totalCount
            nodes {{ stargazerCount }}
        }}
        contributionsCollection {{ totalCommitContributions }}
    }}''')
    return f"query {{ {''.join(fragments)} }}"


def score_user(data: dict | None, username: str) -> dict:
    """Calculate score for a single user. Returns dict with username, approved, reason."""
    if not data:
        return {"username": username, "approved": False, "reason": "User not found"}

    created = datetime.fromisoformat(data["createdAt"].replace("Z", "+00:00"))
    age_days = (datetime.now(timezone.utc) - created).days

    metrics = {
        "age_days": age_days,
        "repos": data["repositories"]["totalCount"],
        "commits": data["contributionsCollection"]["totalCommitContributions"],
        "stars": sum(node["stargazerCount"] for node in (data["repositories"].get("nodes") or []) if node),
    }

    score = sum(
        min(metrics[config["field"]] * config["multiplier"], config["max"])
        for config in SCORING
    )

    return {
        "username": username,
        "approved": score >= THRESHOLD,
        "reason": f"{score:.1f} pts"
    }


def fetch_batch(usernames: list[str], retries: int = 3) -> list[dict]:
    """Fetch and score a batch of users with retry logic."""
    query = build_query(usernames)
    request = urllib.request.Request(
        GITHUB_GRAPHQL,
        data=json.dumps({"query": query}).encode(),
        headers={
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Content-Type": "application/json",
        },
    )

    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = json.loads(response.read())
            break
        except urllib.error.HTTPError as error:
            if attempt < retries - 1 and error.code in (502, 503, 504):
                time.sleep(5 * (attempt + 1))  # Exponential backoff: 5s, 10s, 15s
                continue
            raise

    results = []
    for i, username in enumerate(usernames):
        user_data = data.get("data", {}).get(f"u{i}")
        results.append(score_user(user_data, username))
    return results


def validate_users(usernames: list[str]) -> list[dict]:
    """Validate users in batches of 50."""
    if not usernames:
        return []

    random.shuffle(usernames)
    results = []
    approved_count = 0

    progress_bar = tqdm(
        range(0, len(usernames), BATCH_SIZE),
        desc="Validating",
        unit="batch",
        bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{remaining}] {postfix}"
    )

    for batch_num, start_index in enumerate(progress_bar):
        if MAX_BATCHES and batch_num >= MAX_BATCHES:
            break

        batch = usernames[start_index:start_index + BATCH_SIZE]
        batch_results = fetch_batch(batch)
        results.extend(batch_results)

        approved_count += sum(1 for result in batch_results if result["approved"])
        approval_rate = 100 * approved_count / len(results)
        progress_bar.set_postfix(seed=f"{approval_rate:.0f}%")

        time.sleep(2)  # Rate limiting between batches

    return results
