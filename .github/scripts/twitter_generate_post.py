#!/usr/bin/env python3
"""
Twitter/X Post Generator - Creates engaging tweets from PR updates
Designed for community engagement with meme-friendly, punchy content
"""

import os
import sys
import json
import time
import random
import base64
import requests
from typing import Dict, List, Optional
from datetime import datetime, timedelta, timezone

# Constants
GITHUB_API_BASE = "https://api.github.com"
GITHUB_GRAPHQL_API = "https://api.github.com/graphql"
POLLINATIONS_API_BASE = "https://gen.pollinations.ai/v1/chat/completions"
MODEL = "openai-large"
MAX_SEED = 2147483647
MAX_RETRIES = 3
INITIAL_RETRY_DELAY = 2

# Twitter limits
TWITTER_CHAR_LIMIT = 280


def get_env(key: str, required: bool = True) -> Optional[str]:
    """Get environment variable with optional requirement check"""
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def get_date_range(days_back: int = 1) -> tuple[datetime, datetime]:
    """Get date range for the specified number of days back"""
    now = datetime.now(timezone.utc)
    end_date = now
    start_date = end_date - timedelta(days=days_back)
    return start_date, end_date


def get_merged_prs(owner: str, repo: str, start_date: datetime, token: str) -> List[Dict]:
    """Fetch merged PRs using GraphQL"""
    query = """
    query($owner: String!, $repo: String!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        pullRequests(
          states: MERGED
          first: 100
          after: $cursor
          orderBy: {field: UPDATED_AT, direction: DESC}
          baseRefName: "main"
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            number
            title
            body
            url
            mergedAt
            updatedAt
            author {
              login
            }
            labels(first: 10) {
              nodes {
                name
              }
            }
          }
        }
      }
    }
    """

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    all_prs = []
    cursor = None
    page = 1

    print(f"Fetching merged PRs since {start_date.strftime('%Y-%m-%d %H:%M')} UTC...")

    while True:
        variables = {"owner": owner, "repo": repo, "cursor": cursor}

        response = requests.post(
            GITHUB_GRAPHQL_API,
            headers=headers,
            json={"query": query, "variables": variables},
            timeout=60
        )

        if response.status_code != 200:
            print(f"GraphQL error: {response.status_code} -> {response.text[:500]}")
            return []

        data = response.json()
        if "errors" in data:
            print(f"GraphQL query errors: {data['errors']}")
            return []

        pr_data = data["data"]["repository"]["pullRequests"]
        nodes = pr_data["nodes"]
        page_info = pr_data["pageInfo"]

        print(f"  Page {page}: fetched {len(nodes)} PRs")

        oldest_update_on_page = None

        for pr in nodes:
            merged_at = datetime.fromisoformat(pr["mergedAt"].replace("Z", "+00:00"))
            updated_at = datetime.fromisoformat(pr["updatedAt"].replace("Z", "+00:00"))

            if oldest_update_on_page is None or updated_at < oldest_update_on_page:
                oldest_update_on_page = updated_at

            if merged_at >= start_date:
                labels = [label["name"] for label in pr["labels"]["nodes"]]
                all_prs.append({
                    "number": pr["number"],
                    "title": pr["title"],
                    "body": pr["body"] or "",
                    "author": pr["author"]["login"] if pr.get("author") and pr["author"].get("login") else "ghost",
                    "merged_at": pr["mergedAt"],
                    "html_url": pr["url"],
                    "labels": labels
                })

        if oldest_update_on_page and oldest_update_on_page < start_date:
            break

        if not page_info["hasNextPage"]:
            break

        cursor = page_info["endCursor"]
        page += 1

    return all_prs


def call_pollinations_api(system_prompt: str, user_prompt: str, token: str, temperature: float = 0.9) -> Optional[str]:
    """Call Pollinations AI API with retry logic"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    last_error = None

    for attempt in range(MAX_RETRIES):
        seed = random.randint(0, MAX_SEED)

        payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature,
            "seed": seed
        }

        if attempt > 0:
            backoff_delay = INITIAL_RETRY_DELAY * (2 ** attempt)
            print(f"  Retry {attempt}/{MAX_RETRIES - 1} (waiting {backoff_delay}s)")
            time.sleep(backoff_delay)

        try:
            response = requests.post(
                POLLINATIONS_API_BASE,
                headers=headers,
                json=payload,
                timeout=120
            )

            if response.status_code == 200:
                result = response.json()
                return result['choices'][0]['message']['content']
            else:
                last_error = f"API error: {response.status_code}"
                print(f"  {last_error}: {response.text[:500]}")

        except requests.exceptions.RequestException as e:
            last_error = f"Request failed: {e}"
            print(f"  {last_error}")

    print(f"All {MAX_RETRIES} attempts failed. Last error: {last_error}")
    return None


def generate_twitter_post(prs: List[Dict], token: str) -> Optional[Dict]:
    """Generate a punchy Twitter/X post from PR updates"""

    # Format PRs for context
    pr_summary = ""
    if prs:
        pr_summary = f"TODAY'S UPDATES ({len(prs)} merged PRs):\n"
        for pr in prs[:10]:
            labels_str = f" [{', '.join(pr['labels'])}]" if pr['labels'] else ""
            pr_summary += f"- #{pr['number']}: {pr['title']}{labels_str}\n"
    else:
        pr_summary = "NO UPDATES TODAY"

    system_prompt = f"""You are the extremely online social media person for Pollinations.ai.
Your job is to write BANGER tweets that get engagement - funny, punchy, meme-aware.

{pr_summary}

=== ABOUT POLLINATIONS.AI ===
- Open-source AI generation platform (images, text, audio)
- Free tier - no login required, just use it
- Used by indie devs, hobbyists, meme lords
- We're chill, we're building cool stuff

=== TWITTER VOICE ===
Think: dev who spends too much time on Twitter, knows the memes, genuinely excited about AI

VIBES:
- Casual, conversational, sometimes chaotic
- Self-aware humor (we know we're posting)
- Tech Twitter energy but accessible
- Emojis are encouraged (but not excessive)
- Lowercase energy is fine, punctuation optional

FORMATS THAT WORK:
- "just shipped X. we're so back" energy
- Relatable dev struggles/wins
- "pov: you're building AI tools in 2026"
- Question hooks that invite replies
- Mild chaos/unhinged but harmless
- Celebratory but not corporate

DON'T:
- Sound like a press release
- Use corporate speak
- Be cringe tryhard
- Over-explain
- Use more than 1-2 hashtags (Twitter users hate hashtag spam)
- Exceed 280 characters (CRITICAL)

=== TWEET TYPES ===
1. SHIPPED: We built something, here it is
2. MEME: Relatable dev/AI humor
3. ENGAGEMENT: Question or hot take to spark replies
4. HYPE: Celebrating milestones or cool stuff
5. CHAOS: Slightly unhinged but fun

=== OUTPUT FORMAT (JSON only) ===
{{
    "tweet_type": "shipped|meme|engagement|hype|chaos",
    "tweet": "The actual tweet text (MUST be under 280 chars)",
    "alt_tweet": "Alternative version if first one doesn't hit",
    "hashtags": ["#OpenSource", "#AI"],
    "reasoning": "Why this tweet should work",
    "char_count": 123
}}

=== EXAMPLE TWEETS (for the vibes) ===
- "just added video generation. we're so back 🎬"
- "open source AI tools built different. no login, no bs, just vibes"
- "pov: you tell your boss the AI is 'learning' but really you're just fixing bugs"
- "500 apps built on pollinations. y'all are actually insane (affectionate) 🌸"
- "how it started: 'let's make a simple API' / how it's going: *gestures at everything*"
- "new model dropped. it generates images AND my will to live"
- "normalize shipping features at 2am because you got nerd sniped"

CRITICAL: Tweet MUST be under 280 characters. Count carefully.
"""

    if prs:
        # Pick the most interesting PR titles
        titles = [pr['title'] for pr in prs[:5]]
        user_prompt = f"""Write a tweet about today's updates.
Most interesting stuff: {titles}

Make it punchy, make it fun, make it under 280 chars.
Output valid JSON only."""
    else:
        user_prompt = """No code updates today - create engagement content.

Options:
- Relatable dev meme
- Question to spark replies
- Celebrate community/open source
- Mild chaos posting

Make it good. Under 280 chars.
Output valid JSON only."""

    print("Generating Twitter post...")
    response = call_pollinations_api(system_prompt, user_prompt, token, temperature=0.9)

    if not response:
        print("Post generation failed")
        return None

    try:
        response = response.strip()
        if response.startswith("```"):
            lines = response.split("\n")
            lines = [line for line in lines if not line.startswith("```")]
            response = "\n".join(lines)

        post_data = json.loads(response)

        # Verify character count
        tweet = post_data.get('tweet', '')
        actual_count = len(tweet)
        if actual_count > TWITTER_CHAR_LIMIT:
            print(f"Warning: Tweet is {actual_count} chars, truncating...")
            post_data['tweet'] = tweet[:277] + "..."
            post_data['char_count'] = 280

        print(f"Generated {post_data['tweet_type']} tweet ({len(post_data['tweet'])} chars)")
        return post_data

    except json.JSONDecodeError as e:
        print(f"Failed to parse response: {e}")
        print(f"Response was: {response[:500]}")
        return None


def get_file_sha(github_token: str, owner: str, repo: str, file_path: str, branch: str = "main") -> str:
    """Get the SHA of an existing file"""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{file_path}?ref={branch}",
        headers=headers
    )

    if response.status_code == 200:
        return response.json().get("sha", "")
    return ""


def create_post_pr(post_data: Dict, prs: List[Dict], github_token: str, owner: str, repo: str):
    """Create a PR with the Twitter post JSON"""

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    # Get base branch SHA
    ref_response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/ref/heads/main",
        headers=headers
    )
    if ref_response.status_code != 200:
        print(f"Error getting ref: {ref_response.text}")
        return

    base_sha = ref_response.json()['object']['sha']

    # Create new branch
    branch_name = f"twitter-post-{today}"
    create_branch_response = requests.post(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/refs",
        headers=headers,
        json={
            "ref": f"refs/heads/{branch_name}",
            "sha": base_sha
        }
    )

    if create_branch_response.status_code not in [200, 201]:
        if "Reference already exists" not in create_branch_response.text:
            print(f"Error creating branch: {create_branch_response.text}")
            return
        print(f"Branch {branch_name} already exists, updating...")

    print(f"Created branch: {branch_name}")

    # Build full tweet with hashtags
    full_tweet = post_data['tweet']
    hashtags = post_data.get('hashtags', [])
    if hashtags:
        hashtag_str = " " + " ".join(hashtags[:2])  # Max 2 hashtags
        if len(full_tweet) + len(hashtag_str) <= TWITTER_CHAR_LIMIT:
            full_tweet += hashtag_str

    # Create the JSON post data
    output_data = {
        "date": today,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "platform": "twitter",
        "tweet_type": post_data.get('tweet_type', 'shipped'),
        "tweet": post_data['tweet'],
        "full_tweet": full_tweet,
        "alt_tweet": post_data.get('alt_tweet', ''),
        "hashtags": hashtags,
        "reasoning": post_data.get('reasoning', ''),
        "pr_references": [f"#{pr['number']}" for pr in prs] if prs else [],
        "char_count": len(full_tweet)
    }

    # Create JSON file
    json_path = f"social/news/transformed/twitter/posts/{today}.json"
    json_content = json.dumps(output_data, indent=2, ensure_ascii=False)
    json_encoded = base64.b64encode(json_content.encode()).decode()

    # Check if file exists
    json_sha = get_file_sha(github_token, owner, repo, json_path, branch_name)
    if not json_sha:
        json_sha = get_file_sha(github_token, owner, repo, json_path, "main")

    json_payload = {
        "message": f"twitter: add post for {today}",
        "content": json_encoded,
        "branch": branch_name
    }
    if json_sha:
        json_payload["sha"] = json_sha

    json_response = requests.put(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{json_path}",
        headers=headers,
        json=json_payload
    )

    if json_response.status_code not in [200, 201]:
        print(f"Error creating JSON file: {json_response.text}")
        return

    print(f"Created {json_path}")

    # Create PR
    pr_title = f"Twitter Post - {today}"

    pr_body = f"""## Twitter/X Post for {today}

**Tweet Type:** {output_data['tweet_type']}
**Character Count:** {output_data['char_count']}/280

### Tweet
```
{output_data['full_tweet']}
```

### Alternative
```
{output_data['alt_tweet']}
```

### Hashtags
{' '.join(output_data['hashtags'])}

---

**Reasoning:** {output_data['reasoning']}

**PR References:** {', '.join(output_data['pr_references']) if output_data['pr_references'] else 'None (engagement content)'}

---
When this PR is merged, the tweet will be published via Buffer.

Generated automatically by GitHub Actions
"""

    pr_response = requests.post(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls",
        headers=headers,
        json={
            "title": pr_title,
            "body": pr_body,
            "head": branch_name,
            "base": "main"
        }
    )

    if pr_response.status_code not in [200, 201]:
        if "A pull request already exists" in pr_response.text:
            list_response = requests.get(
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls?head={owner}:{branch_name}&state=open",
                headers=headers
            )
            if list_response.status_code == 200 and list_response.json():
                existing_pr = list_response.json()[0]
                update_response = requests.patch(
                    f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls/{existing_pr['number']}",
                    headers=headers,
                    json={"title": pr_title, "body": pr_body}
                )
                if update_response.status_code == 200:
                    print(f"Updated existing PR #{existing_pr['number']}: {existing_pr['html_url']}")
                    return
            print("PR already exists but could not update it")
            return
        print(f"Error creating PR: {pr_response.text}")
        return

    pr_info = pr_response.json()
    print(f"Created PR #{pr_info['number']}: {pr_info['html_url']}")

    # Add labels
    pr_labels = get_env('PR_LABELS', required=False)
    if pr_labels:
        labels_list = [label.strip() for label in pr_labels.split(',')]
        requests.post(
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/issues/{pr_info['number']}/labels",
            headers=headers,
            json={"labels": labels_list}
        )


def main():
    github_token = get_env('GITHUB_TOKEN')
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    repo_full_name = get_env('GITHUB_REPOSITORY')
    source_repo = get_env('SOURCE_REPO', required=False) or "pollinations/pollinations"
    days_back = int(get_env('DAYS_BACK', required=False) or "1")
    force_engagement = get_env('FORCE_ENGAGEMENT', required=False) == "true"

    owner_name, repo_name = repo_full_name.split('/')
    source_owner, source_repo_name = source_repo.split('/')

    # Fetch merged PRs (unless forcing engagement content)
    merged_prs = []
    if force_engagement:
        print(f"\n=== Forcing Engagement Content ===")
    else:
        start_date, _ = get_date_range(days_back)
        print(f"\n=== Fetching PRs from {source_repo} (last {days_back} day(s)) ===")
        merged_prs = get_merged_prs(source_owner, source_repo_name, start_date, github_token)
        print(f"Found {len(merged_prs)} merged PRs")

    # Generate post
    print(f"\n=== Generating Twitter Post ===")
    post_data = generate_twitter_post(merged_prs, pollinations_token)

    if not post_data:
        print("Failed to generate post. Exiting.")
        sys.exit(1)

    # Create PR
    print(f"\n=== Creating PR ===")
    create_post_pr(post_data, merged_prs, github_token, owner_name, repo_name)

    print("\n=== Done! ===")


if __name__ == "__main__":
    main()
