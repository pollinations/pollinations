"""GitHub user validation for Seed tier eligibility.
Phase 1: Simple points-based validation.

Formula:
  - GitHub account age: 1 pt/month (max 6)
  - Commits (any repo): 0.1 pt each (max 1)
  - Public repos: 0.5 pt each (max 1)
  - Threshold: >= 7 pts

Fully automatic - no red flags, no manual review.
"""

import asyncio
import aiohttp
import os
from datetime import datetime, timezone
from dataclasses import dataclass, field

# GitHub API configuration
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
GITHUB_GRAPHQL = "https://api.github.com/graphql"

# Batch processing settings (50 users per request, 5 concurrent batches)
BATCH_SIZE = 50
MAX_CONCURRENT_BATCHES = 5

# Retry configuration with exponential backoff
MAX_RETRIES = 5
INITIAL_BACKOFF = 1
MAX_BACKOFF = 60
BACKOFF_MULTIPLIER = 2

# Points formula configuration
POINTS_PER_MONTH = 1.0
MAX_AGE_POINTS = 6.0

POINTS_PER_COMMIT = 0.1
MAX_COMMIT_POINTS = 1.0

POINTS_PER_REPO = 0.5
MAX_REPO_POINTS = 1.0

# Threshold for approval (max possible = 8 pts)
APPROVE_THRESHOLD = 7.0


@dataclass
class UserScore:
    """Scoring result for a single GitHub user."""
    username: str
    account_age_days: int = 0
    public_repos: int = 0
    total_commits: int = 0
    score: float = 0.0
    score_breakdown: dict = field(default_factory=dict)
    approved: bool = False
    reason: str = ""


def build_batch_query(usernames: list[str]) -> str:
    """
    Build a single GraphQL query to fetch data for multiple users.
    Only fetches the 3 metrics we need: account age, commits, public repos.
    """
    user_fragments = []
    for i, username in enumerate(usernames):
        safe_username = username.replace('"', '\\"').replace("\\", "\\\\")
        user_fragments.append(f'''
    u{i}: user(login: "{safe_username}") {{
        login
        createdAt
        repositories(privacy: PUBLIC, isFork: false) {{
            totalCount
        }}
        contributionsCollection {{
            totalCommitContributions
        }}
    }}''')

    return f'''query BatchUserValidation {{
    {"".join(user_fragments)}
    rateLimit {{
        remaining
        resetAt
        limit
    }}
}}'''


def calculate_score(user_data: dict, username: str) -> UserScore:
    """
    Calculate approval score using simple points formula.
    
    Formula:
      - Account age: 1 pt/month (max 6)
      - Commits: 0.1 pt each (max 1)
      - Public repos: 0.5 pt each (max 1)
      - Threshold: >= 7 pts
    """
    result = UserScore(username=username)

    if not user_data:
        result.reason = "User not found"
        return result

    # Extract metrics
    created_at = datetime.fromisoformat(user_data["createdAt"].replace("Z", "+00:00"))
    result.account_age_days = (datetime.now(timezone.utc) - created_at).days
    result.public_repos = user_data["repositories"]["totalCount"]
    result.total_commits = user_data["contributionsCollection"]["totalCommitContributions"]

    # Calculate points
    breakdown = {}
    
    # Account age: 1 pt/month, max 6
    age_months = result.account_age_days / 30.0
    breakdown["age"] = min(age_months * POINTS_PER_MONTH, MAX_AGE_POINTS)
    
    # Commits: 0.1 pt each, max 1
    breakdown["commits"] = min(result.total_commits * POINTS_PER_COMMIT, MAX_COMMIT_POINTS)
    
    # Public repos: 0.5 pt each, max 1
    breakdown["repos"] = min(result.public_repos * POINTS_PER_REPO, MAX_REPO_POINTS)

    result.score = sum(breakdown.values())
    result.score_breakdown = breakdown

    # Decision
    if result.score >= APPROVE_THRESHOLD:
        result.approved = True
        result.reason = f"APPROVED: {result.score:.1f} pts"
    else:
        result.approved = False
        result.reason = f"DENY: {result.score:.1f} < {APPROVE_THRESHOLD} pts"

    return result


async def validate_batch(
    session: aiohttp.ClientSession,
    usernames: list[str]
) -> tuple[list[UserScore], dict]:
    """
    Fetch GitHub data for a batch of users and calculate scores.
    
    Handles GitHub rate limiting with exponential backoff:
    - 403/429: Rate limited, wait and retry
    - 5xx: Server error, wait and retry
    - GraphQL errors: Check if rate limit related
    
    Returns: (list of UserScore results, rate limit info)
    """
    query = build_batch_query(usernames)
    payload = {"query": query}

    backoff = INITIAL_BACKOFF
    last_error = None

    for attempt in range(MAX_RETRIES):
        try:
            async with session.post(GITHUB_GRAPHQL, json=payload) as resp:
                # HTTP 403: Rate limited
                if resp.status == 403:
                    retry_after = resp.headers.get("Retry-After")
                    wait_time = int(retry_after) if retry_after else min(backoff, MAX_BACKOFF)
                    print(f"Rate limited (403). Waiting {wait_time}s... [{attempt + 1}/{MAX_RETRIES}]")
                    await asyncio.sleep(wait_time)
                    backoff *= BACKOFF_MULTIPLIER
                    continue

                # HTTP 429: Rate limited (too many requests)
                if resp.status == 429:
                    retry_after = resp.headers.get("Retry-After", str(backoff))
                    wait_time = int(retry_after)
                    print(f"Rate limited (429). Waiting {wait_time}s... [{attempt + 1}/{MAX_RETRIES}]")
                    await asyncio.sleep(wait_time)
                    backoff *= BACKOFF_MULTIPLIER
                    continue

                # 5xx: Server error - retry with backoff
                if resp.status >= 500:
                    print(f"Server error ({resp.status}). Waiting {backoff}s... [{attempt + 1}/{MAX_RETRIES}]")
                    await asyncio.sleep(backoff)
                    backoff *= BACKOFF_MULTIPLIER
                    continue

                # Unexpected HTTP error
                if resp.status != 200:
                    return [UserScore(username=u, reason=f"API error ({resp.status})") for u in usernames], {}

                data = await resp.json()

                # Check for GraphQL errors
                if "errors" in data:
                    error_msg = data["errors"][0].get("message", "Unknown error")
                    if "rate limit" in error_msg.lower():
                        print(f"GraphQL rate limit. Waiting {backoff}s... [{attempt + 1}/{MAX_RETRIES}]")
                        await asyncio.sleep(backoff)
                        backoff *= BACKOFF_MULTIPLIER
                        continue
                    return [UserScore(username=u, reason=f"GraphQL error: {error_msg}") for u in usernames], {}

                # Parse results: each alias (u0, u1, etc.) maps to a user
                results = []
                for i, username in enumerate(usernames):
                    user_data = data.get("data", {}).get(f"u{i}")
                    results.append(calculate_score(user_data, username))

                rate_limit = data.get("data", {}).get("rateLimit", {})
                return results, rate_limit

        except aiohttp.ClientError as e:
            last_error = str(e)
            print(f"Network error: {last_error}. Waiting {backoff}s... [{attempt + 1}/{MAX_RETRIES}]")
            await asyncio.sleep(backoff)
            backoff *= BACKOFF_MULTIPLIER

    # All retries exhausted
    return [UserScore(username=u, reason=f"Max retries exceeded: {last_error or 'Unknown'}") for u in usernames], {}


async def validate_users(usernames: list[str]) -> list[UserScore]:
    """
    Validate multiple users in parallel batches.
    
    Process:
    1. Split usernames into batches (50 per batch)
    2. Process up to 5 batches concurrently
    3. Monitor rate limit and pause if dropping below 100 remaining
    4. Return all scores in original order
    """
    if not usernames:
        return []

    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Content-Type": "application/json",
    }

    # Split into batches
    batches = [usernames[i:i + BATCH_SIZE] for i in range(0, len(usernames), BATCH_SIZE)]
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_BATCHES)
    all_results = []

    async def process_batch(session, batch, batch_num):
        """Process a single batch with concurrency limit."""
        async with semaphore:
            results, rate_limit = await validate_batch(session, batch)
            remaining = rate_limit.get("remaining", "?")
            print(f"Batch {batch_num + 1}/{len(batches)} done. Rate limit: {remaining}")

            # Pause if rate limit is running low (< 100 remaining)
            if isinstance(remaining, int) and remaining < 100:
                reset_at = rate_limit.get("resetAt")
                if reset_at:
                    reset_time = datetime.fromisoformat(reset_at.replace("Z", "+00:00"))
                    wait_seconds = (reset_time - datetime.now(timezone.utc)).total_seconds()
                    if wait_seconds > 0:
                        print(f"Rate limit low, waiting {wait_seconds:.0f}s...")
                        await asyncio.sleep(wait_seconds + 1)
            return results

    # Fetch all batches concurrently
    async with aiohttp.ClientSession(headers=headers) as session:
        tasks = [process_batch(session, batch, i) for i, batch in enumerate(batches)]
        batch_results = await asyncio.gather(*tasks)
        for results in batch_results:
            all_results.extend(results)

    return all_results
