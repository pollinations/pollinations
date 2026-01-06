"""
GitHub user validation for Seed tier eligibility.
Checks if a user looks legit (not an alt/abuse account).
Uses batched GraphQL for max speed - 50 users per call.

V1: Simple approve/deny based on hard requirements + score threshold.
"""

import asyncio
import aiohttp
import os
from datetime import datetime, timezone
from dataclasses import dataclass, field

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
GITHUB_GRAPHQL = "https://api.github.com/graphql"

# Batch settings
BATCH_SIZE = 50
MAX_CONCURRENT_BATCHES = 5

# Retry settings
MAX_RETRIES = 5
INITIAL_BACKOFF = 1  # seconds
MAX_BACKOFF = 60  # seconds
BACKOFF_MULTIPLIER = 2

# Hard requirements (must pass ALL)
MIN_ACCOUNT_AGE_DAYS = 60
MIN_PUBLIC_REPOS = 1
MIN_COMMITS = 10

# Approval threshold
APPROVE_SCORE = 50


@dataclass
class UserScore:
    username: str
    # Raw data
    account_age_days: int = 0
    public_repos: int = 0
    total_commits: int = 0
    total_prs: int = 0
    total_issues: int = 0
    followers: int = 0
    following: int = 0
    has_bio: bool = False
    has_website: bool = False
    has_company: bool = False
    has_location: bool = False
    has_avatar: bool = False
    has_recent_activity: bool = False
    contributed_repos: int = 0
    # Scoring
    score: int = 0
    score_breakdown: dict = field(default_factory=dict)
    red_flags: list = field(default_factory=list)
    # Result
    approved: bool = False
    reason: str = ""


def build_batch_query(usernames: list[str]) -> str:
    """Build a batched GraphQL query for multiple users."""
    user_fragments = []
    for i, username in enumerate(usernames):
        safe_username = username.replace('"', '\\"').replace("\\", "\\\\")
        user_fragments.append(f'''
    u{i}: user(login: "{safe_username}") {{
        login
        createdAt
        bio
        websiteUrl
        company
        location
        avatarUrl
        followers {{
            totalCount
        }}
        following {{
            totalCount
        }}
        repositories(privacy: PUBLIC, isFork: false) {{
            totalCount
        }}
        contributionsCollection {{
            totalCommitContributions
            totalPullRequestContributions
            totalIssueContributions
            hasAnyContributions
        }}
        repositoriesContributedTo(privacy: PUBLIC, contributionTypes: [COMMIT, PULL_REQUEST]) {{
            totalCount
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
    """Calculate legitimacy score for a user."""
    result = UserScore(username=username)

    if not user_data:
        result.reason = "User not found"
        return result

    # Extract raw data
    created_at = datetime.fromisoformat(user_data["createdAt"].replace("Z", "+00:00"))
    result.account_age_days = (datetime.now(timezone.utc) - created_at).days
    result.public_repos = user_data["repositories"]["totalCount"]
    result.followers = user_data["followers"]["totalCount"]
    result.following = user_data["following"]["totalCount"]
    result.has_bio = bool(user_data.get("bio"))
    result.has_website = bool(user_data.get("websiteUrl"))
    result.has_company = bool(user_data.get("company"))
    result.has_location = bool(user_data.get("location"))
    result.has_avatar = bool(user_data.get("avatarUrl")) and "gravatar" not in user_data.get("avatarUrl", "")

    contributions = user_data["contributionsCollection"]
    result.total_commits = contributions["totalCommitContributions"]
    result.total_prs = contributions["totalPullRequestContributions"]
    result.total_issues = contributions["totalIssueContributions"]
    result.has_recent_activity = contributions["hasAnyContributions"]
    result.contributed_repos = user_data["repositoriesContributedTo"]["totalCount"]

    # Check hard requirements
    hard_failures = []
    if result.account_age_days < MIN_ACCOUNT_AGE_DAYS:
        hard_failures.append(f"Account too new ({result.account_age_days} < {MIN_ACCOUNT_AGE_DAYS} days)")
    if result.public_repos < MIN_PUBLIC_REPOS:
        hard_failures.append(f"No public repos")
    if result.total_commits < MIN_COMMITS:
        hard_failures.append(f"Not enough commits ({result.total_commits} < {MIN_COMMITS})")

    if hard_failures:
        result.approved = False
        result.reason = "DENY: " + "; ".join(hard_failures)
        return result

    # Calculate score
    breakdown = {}

    # Account age (max 25)
    if result.account_age_days >= 730:
        breakdown["account_age"] = 25
    elif result.account_age_days >= 365:
        breakdown["account_age"] = 20
    elif result.account_age_days >= 180:
        breakdown["account_age"] = 15
    elif result.account_age_days >= 90:
        breakdown["account_age"] = 10
    else:
        breakdown["account_age"] = 5

    # Profile (max 15)
    profile_score = 0
    if result.has_bio:
        profile_score += 5
    if result.has_avatar:
        profile_score += 2
    if result.has_website:
        profile_score += 3
    if result.has_company:
        profile_score += 3
    if result.has_location:
        profile_score += 2
    breakdown["profile"] = min(profile_score, 15)

    # Commits (max 20)
    if result.total_commits >= 200:
        breakdown["commits"] = 20
    elif result.total_commits >= 51:
        breakdown["commits"] = 15
    elif result.total_commits >= 11:
        breakdown["commits"] = 10
    else:
        breakdown["commits"] = 5

    # Contributions (max 25)
    contrib_score = 0
    if result.total_prs > 0:
        contrib_score += 10
    if result.total_issues > 0:
        contrib_score += 5
    if result.contributed_repos >= 5:
        contrib_score += 10
    elif result.contributed_repos >= 2:
        contrib_score += 5
    breakdown["contributions"] = min(contrib_score, 25)

    # Recent activity (max 10)
    breakdown["recent_activity"] = 10 if result.has_recent_activity else 0

    # Red flags
    red_flags = []
    total_activity = result.total_commits + result.total_prs + result.total_issues

    # Zero social connections on older account
    if result.followers == 0 and result.following == 0 and result.account_age_days >= 90:
        red_flags.append("No social connections")
        breakdown["red_flag_isolated"] = -15

    # Empty profile
    if not result.has_bio and not result.has_website and not result.has_company:
        red_flags.append("Empty profile")
        breakdown["red_flag_empty_profile"] = -15

    # Suspicious follower ratio
    if result.followers > 100 and total_activity < 10:
        red_flags.append("Suspicious follower ratio")
        breakdown["red_flag_follower_ratio"] = -15

    # Dormant old account
    if result.account_age_days > 365 and not result.has_recent_activity:
        red_flags.append("Dormant account")
        breakdown["red_flag_dormant"] = -10

    result.red_flags = red_flags
    result.score = max(0, sum(breakdown.values()))
    result.score_breakdown = breakdown

    # Final decision
    if result.score >= APPROVE_SCORE:
        result.approved = True
        result.reason = f"APPROVED: Score {result.score}"
    else:
        result.approved = False
        result.reason = f"DENY: Score {result.score} < {APPROVE_SCORE}"

    if red_flags:
        result.reason += f" | Flags: {', '.join(red_flags)}"

    return result


async def validate_batch(
    session: aiohttp.ClientSession,
    usernames: list[str]
) -> tuple[list[UserScore], dict]:
    """Validate a batch of users with exponential backoff."""
    query = build_batch_query(usernames)
    payload = {"query": query}

    backoff = INITIAL_BACKOFF
    last_error = None

    for attempt in range(MAX_RETRIES):
        try:
            async with session.post(GITHUB_GRAPHQL, json=payload) as resp:
                if resp.status == 403:
                    retry_after = resp.headers.get("Retry-After")
                    wait_time = int(retry_after) if retry_after else min(backoff, MAX_BACKOFF)
                    print(f"Rate limited (403). Waiting {wait_time}s... [{attempt + 1}/{MAX_RETRIES}]")
                    await asyncio.sleep(wait_time)
                    backoff *= BACKOFF_MULTIPLIER
                    continue

                if resp.status == 429:
                    retry_after = resp.headers.get("Retry-After", str(backoff))
                    wait_time = int(retry_after)
                    print(f"Rate limited (429). Waiting {wait_time}s... [{attempt + 1}/{MAX_RETRIES}]")
                    await asyncio.sleep(wait_time)
                    backoff *= BACKOFF_MULTIPLIER
                    continue

                if resp.status >= 500:
                    print(f"Server error ({resp.status}). Waiting {backoff}s... [{attempt + 1}/{MAX_RETRIES}]")
                    await asyncio.sleep(backoff)
                    backoff *= BACKOFF_MULTIPLIER
                    continue

                if resp.status != 200:
                    return [UserScore(username=u, reason=f"API error ({resp.status})") for u in usernames], {}

                data = await resp.json()

                if "errors" in data:
                    error_msg = data["errors"][0].get("message", "Unknown error")
                    if "rate limit" in error_msg.lower():
                        print(f"GraphQL rate limit. Waiting {backoff}s... [{attempt + 1}/{MAX_RETRIES}]")
                        await asyncio.sleep(backoff)
                        backoff *= BACKOFF_MULTIPLIER
                        continue
                    return [UserScore(username=u, reason=f"GraphQL error: {error_msg}") for u in usernames], {}

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

    return [UserScore(username=u, reason=f"Max retries exceeded: {last_error or 'Unknown'}") for u in usernames], {}


async def validate_users(usernames: list[str]) -> list[UserScore]:
    """Validate multiple users with batched GraphQL queries."""
    if not usernames:
        return []

    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Content-Type": "application/json",
    }

    batches = [usernames[i:i + BATCH_SIZE] for i in range(0, len(usernames), BATCH_SIZE)]
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_BATCHES)
    all_results = []

    async def process_batch(session, batch, batch_num):
        async with semaphore:
            results, rate_limit = await validate_batch(session, batch)
            remaining = rate_limit.get("remaining", "?")
            print(f"Batch {batch_num + 1}/{len(batches)} done. Rate limit: {remaining}")

            if isinstance(remaining, int) and remaining < 100:
                reset_at = rate_limit.get("resetAt")
                if reset_at:
                    reset_time = datetime.fromisoformat(reset_at.replace("Z", "+00:00"))
                    wait_seconds = (reset_time - datetime.now(timezone.utc)).total_seconds()
                    if wait_seconds > 0:
                        print(f"Rate limit low, waiting {wait_seconds:.0f}s...")
                        await asyncio.sleep(wait_seconds + 1)
            return results

    async with aiohttp.ClientSession(headers=headers) as session:
        tasks = [process_batch(session, batch, i) for i, batch in enumerate(batches)]
        batch_results = await asyncio.gather(*tasks)
        for results in batch_results:
            all_results.extend(results)

    return all_results
