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
import urllib.request
from datetime import datetime, timezone

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
GITHUB_GRAPHQL = "https://api.github.com/graphql"

# Points formula
POINTS_PER_MONTH = 1.0
MAX_AGE_POINTS = 6.0
POINTS_PER_COMMIT = 0.1
MAX_COMMIT_POINTS = 1.0
POINTS_PER_REPO = 0.5
MAX_REPO_POINTS = 1.0
APPROVE_THRESHOLD = 7.0

# Batch size (50 users per GraphQL query = ~2 points, very efficient)
BATCH_SIZE = 50


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
    age_days = (datetime.now(timezone.utc) - created).days
    repos = data["repositories"]["totalCount"]
    commits = data["contributionsCollection"]["totalCommitContributions"]

    # Calculate points
    age_pts = min(age_days / 30.0 * POINTS_PER_MONTH, MAX_AGE_POINTS)
    commit_pts = min(commits * POINTS_PER_COMMIT, MAX_COMMIT_POINTS)
    repo_pts = min(repos * POINTS_PER_REPO, MAX_REPO_POINTS)
    score = age_pts + commit_pts + repo_pts

    approved = score >= APPROVE_THRESHOLD
    reason = f"{'APPROVED' if approved else 'DENY'}: {score:.1f} pts"
    return {"username": username, "approved": approved, "reason": reason}


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

    results = []
    for i in range(0, len(usernames), BATCH_SIZE):
        batch = usernames[i:i + BATCH_SIZE]
        results.extend(fetch_batch(batch))
    return results
