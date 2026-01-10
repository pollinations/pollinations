"""GitHub user validation for Seed tier eligibility.
Phase 1: Simple points-based validation.

Formula:
  - GitHub account age: 1 pt/month (max 6)
  - Commits (any repo): 0.1 pt each (max 1)
  - Public repos: 0.5 pt each (max 1)
  - Threshold: >= 7 pts

Fully automatic - no red flags, no manual review.
"""

import json
import os
import random
import time
import urllib.request
from datetime import datetime, timezone

from tqdm import tqdm

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
GITHUB_GRAPHQL = "https://api.github.com/graphql"
BATCH_SIZE = 50

# Scoring config: each metric has a multiplier and max points
SCORING = [
    {"field": "age_days", "multiplier": 1/30, "max": 6.0},  # 1pt/month, max 6
    {"field": "commits",  "multiplier": 0.1,  "max": 1.0},  # 0.1pt each, max 1
    {"field": "repos",    "multiplier": 0.5,  "max": 1.0},  # 0.5pt each, max 1
]
THRESHOLD = 7.0


def build_query(usernames: list[str]) -> str:
    """Build GraphQL query for multiple users."""
    fragments = []
    for i, u in enumerate(usernames):
        safe = u.replace('"', '\\"').replace("\\", "\\\\")
        fragments.append(f'''
    u{i}: user(login: "{safe}") {{
        login
        createdAt
        repositories(privacy: PUBLIC, isFork: false) {{ totalCount }}
        contributionsCollection {{ totalCommitContributions }}
    }}''')
    return f"query {{ {''.join(fragments)} }}"


def score_user(data: dict | None, username: str) -> dict:
    """Calculate score for a single user. Returns dict with username, approved, reason."""
    if not data:
        return {"username": username, "approved": False, "reason": "User not found"}

    created = datetime.fromisoformat(data["createdAt"].replace("Z", "+00:00"))
    metrics = {
        "age_days": (datetime.now(timezone.utc) - created).days,
        "repos": data["repositories"]["totalCount"],
        "commits": data["contributionsCollection"]["totalCommitContributions"],
    }

    score = sum(min(metrics[s["field"]] * s["multiplier"], s["max"]) for s in SCORING)
    approved = score >= THRESHOLD
    return {"username": username, "approved": approved, "reason": f"{score:.1f} pts"}


def fetch_batch(usernames: list[str]) -> list[dict]:
    """Fetch and score a batch of users. Simple synchronous request."""
    query = build_query(usernames)
    req = urllib.request.Request(
        GITHUB_GRAPHQL,
        data=json.dumps({"query": query}).encode(),
        headers={
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())

    results = []
    for i, username in enumerate(usernames):
        user_data = data.get("data", {}).get(f"u{i}")
        results.append(score_user(user_data, username))
    return results


def validate_users(usernames: list[str]) -> list[dict]:
    """Validate users in batches of 50. Simple sequential processing."""
    if not usernames:
        return []

    random.shuffle(usernames)
    results = []
    approved = 0
    pbar = tqdm(range(0, len(usernames), BATCH_SIZE), desc="Validating", unit="batch", bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{remaining}] {postfix}")
    
    for i in pbar:
        batch_results = fetch_batch(usernames[i:i + BATCH_SIZE])
        results.extend(batch_results)
        approved += sum(1 for r in batch_results if r["approved"])
        pbar.set_postfix(seed=f"{100*approved/len(results):.0f}%")
        time.sleep(2)
        
    return results
