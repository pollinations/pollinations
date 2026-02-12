#!/usr/bin/env python3
"""
Tier 3: Weekly Publish

Friday 15:00 UTC cron:
  1. Find the weekly PR for this week (branch: weekly-digest-YYYY-MM-DD)
  2. If not merged → skip
  3. If merged → publish all 5 platforms:
     - Buffer staging: Twitter, LinkedIn, Instagram
     - Reddit direct posting (OAuth2 API)
     - Discord webhook post

See social/PIPELINE.md for full architecture.
"""

import os
import sys
import json
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional

from common import get_env, github_api_request, GITHUB_API_BASE, deploy_reddit_post, DISCORD_CHAR_LIMIT
from buffer_publish import (
    publish_twitter_post,
    publish_linkedin_post,
    publish_instagram_post,
)

# ── Constants ────────────────────────────────────────────────────────

WEEKLY_REL_DIR = "social/news/weekly"
DISCORD_CHUNK_SIZE = 1900
REDDIT_USER_AGENT = "pollinations-news-bot/1.0"
REDDIT_SUBREDDIT = "pollinations_ai"


# ── Helpers ──────────────────────────────────────────────────────────

def get_last_wednesday() -> str:
    """Get the date of the most recent Wednesday (the week_end for the weekly summary).
    The weekly covers Thu→Wed. This runs on Friday, so last Wednesday is 2 days ago."""
    today = datetime.now(timezone.utc).date()
    # Wednesday = weekday 2. Find most recent Wednesday.
    days_since_wednesday = (today.weekday() - 2) % 7
    wednesday = today - timedelta(days=days_since_wednesday)
    return wednesday.strftime("%Y-%m-%d")


def find_merged_weekly_pr(github_token: str, owner: str, repo: str,
                          week_end: str) -> Optional[int]:
    """Check if the weekly summary PR for this week was merged.
    Returns PR number if merged, None otherwise."""
    branch = f"weekly-digest-{week_end}"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
    }

    # Search for closed PRs from this branch
    resp = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls"
        f"?head={owner}:{branch}&state=closed&per_page=5",
        headers=headers,
    )

    if resp.status_code != 200:
        print(f"  Error searching PRs: {resp.status_code}")
        return None

    for pr in resp.json():
        if pr.get("merged_at"):
            return pr["number"]

    return None


def read_weekly_file(path: str, github_token: str, owner: str, repo: str) -> Optional[Dict]:
    """Read a JSON file from the repo (local or API)."""
    # Try local first
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    # Fall back to GitHub API
    import base64
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
    }
    resp = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}",
        headers=headers,
    )
    if resp.status_code == 200:
        content = base64.b64decode(resp.json()["content"]).decode()
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass
    return None


def chunk_message(message: str, max_length: int = DISCORD_CHUNK_SIZE):
    """Split message into chunks at paragraph breaks."""
    if len(message) <= max_length:
        return [message]

    chunks = []
    remaining = message
    while remaining:
        if len(remaining) <= max_length:
            chunks.append(remaining)
            break
        chunk = remaining[:max_length]
        # Split at paragraph break
        split = chunk.rfind("\n\n")
        if split >= max_length * 0.5:
            split_point = split + 2
        else:
            split = chunk.rfind("\n")
            if split >= max_length * 0.5:
                split_point = split + 1
            else:
                split_point = max_length
        chunks.append(remaining[:split_point].rstrip())
        remaining = remaining[split_point:].lstrip()
    return chunks


def get_reddit_access_token(client_id: str, client_secret: str,
                            username: str, password: str) -> Optional[str]:
    """Get Reddit OAuth2 access token using script-type app credentials."""
    resp = requests.post(
        "https://www.reddit.com/api/v1/access_token",
        auth=(client_id, client_secret),
        data={"grant_type": "password", "username": username, "password": password},
        headers={"User-Agent": REDDIT_USER_AGENT},
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"  Reddit auth error: {resp.status_code} {resp.text[:200]}")
        return None
    data = resp.json()
    if "access_token" not in data:
        print(f"  Reddit auth failed: {data}")
        return None
    return data["access_token"]


def post_to_reddit(reddit_data: Dict, client_id: str, client_secret: str,
                   username: str, password: str) -> bool:
    """Post weekly update to r/pollinations_ai. Returns True on success."""
    title = reddit_data.get("title", "")
    image_url = reddit_data.get("image", {}).get("url", "")

    if not title or not image_url:
        print("  Reddit: missing title or image URL — skipping")
        return False

    token = get_reddit_access_token(client_id, client_secret, username, password)
    if not token:
        return False

    resp = requests.post(
        "https://oauth.reddit.com/api/submit",
        headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": REDDIT_USER_AGENT,
        },
        data={
            "sr": REDDIT_SUBREDDIT,
            "kind": "link",
            "title": title,
            "url": image_url,
            "resubmit": "true",
        },
        timeout=30,
    )

    if resp.status_code == 200:
        result = resp.json()
        if result.get("json", {}).get("errors"):
            print(f"  Reddit submit errors: {result['json']['errors']}")
            return False
        post_url = result.get("json", {}).get("data", {}).get("url", "")
        print(f"  Reddit: posted successfully — {post_url}")
        return True

    print(f"  Reddit submit error: {resp.status_code} {resp.text[:200]}")
    return False


def post_to_discord(webhook_url: str, message: str, image_url: str = None) -> bool:
    """Post weekly summary to Discord with optional image. Returns True on success."""
    # Download image if available
    image_bytes = None
    if image_url:
        try:
            resp = requests.get(image_url, timeout=30)
            if resp.status_code == 200 and "image" in resp.headers.get("content-type", ""):
                image_bytes = resp.content
        except Exception as e:
            print(f"  Could not download image for Discord: {e}")

    chunks = chunk_message(message)
    for i, chunk in enumerate(chunks):
        # Attach image to the first chunk only
        if i == 0 and image_bytes:
            files = {
                "payload_json": (None, json.dumps({"content": chunk}), "application/json"),
                "files[0]": ("image.jpg", image_bytes, "image/jpeg"),
            }
            resp = requests.post(webhook_url, files=files, timeout=30)
        else:
            resp = requests.post(webhook_url, json={"content": chunk}, timeout=30)
        if resp.status_code not in [200, 204]:
            print(f"  Discord error on chunk {i+1}: {resp.status_code} {resp.text[:200]}")
            return False
        if i < len(chunks) - 1:
            import time
            time.sleep(1)
    print(f"  Discord: posted {len(chunks)} chunk(s)" + (" with image" if image_bytes else ""))
    return True


# ── Main ─────────────────────────────────────────────────────────────

def main():
    print("=== Tier 3: Weekly Publish ===")

    github_token = get_env("GITHUB_TOKEN")
    buffer_token = get_env("BUFFER_ACCESS_TOKEN")
    discord_webhook = get_env("DISCORD_WEBHOOK_URL")
    repo_full = get_env("GITHUB_REPOSITORY")
    week_end_override = get_env("WEEK_END_DATE", required=False)

    # Reddit credentials (optional — skip Reddit if not configured)
    reddit_client_id = get_env("REDDIT_CLIENT_ID", required=False)
    reddit_client_secret = get_env("REDDIT_CLIENT_SECRET", required=False)
    reddit_username = get_env("REDDIT_USERNAME", required=False)
    reddit_password = get_env("REDDIT_PASSWORD", required=False)
    reddit_configured = all([reddit_client_id, reddit_client_secret,
                             reddit_username, reddit_password])

    owner, repo = repo_full.split("/")
    week_end = week_end_override or get_last_wednesday()
    print(f"  Week ending: {week_end}")

    # ── Check if weekly PR was merged ────────────────────────────────
    print(f"\n[1/2] Checking for merged weekly PR...")
    pr_number = find_merged_weekly_pr(github_token, owner, repo, week_end)

    if not pr_number:
        print("  Weekly PR not merged — skipping publish.")
        print("=== Done (nothing to publish) ===")
        return

    print(f"  Found merged PR #{pr_number}")

    # ── Publish all 5 platforms ──────────────────────────────────────
    print(f"\n[2/2] Publishing to all platforms...")
    weekly_dir = f"{WEEKLY_REL_DIR}/{week_end}"
    results = {}

    # Twitter
    twitter_data = read_weekly_file(f"{weekly_dir}/twitter.json", github_token, owner, repo)
    if twitter_data:
        print("  Twitter...")
        results["twitter"] = publish_twitter_post(twitter_data, buffer_token)
    else:
        print("  No twitter.json — skipping")

    # LinkedIn
    linkedin_data = read_weekly_file(f"{weekly_dir}/linkedin.json", github_token, owner, repo)
    if linkedin_data:
        print("  LinkedIn...")
        results["linkedin"] = publish_linkedin_post(linkedin_data, buffer_token)
    else:
        print("  No linkedin.json — skipping")

    # Instagram
    instagram_data = read_weekly_file(f"{weekly_dir}/instagram.json", github_token, owner, repo)
    if instagram_data:
        print("  Instagram...")
        results["instagram"] = publish_instagram_post(instagram_data, buffer_token)
    else:
        print("  No instagram.json — skipping")

    # Reddit
    if reddit_configured:
        reddit_data = read_weekly_file(f"{weekly_dir}/reddit.json", github_token, owner, repo)
        if reddit_data:
            print("  Reddit...")
            results["reddit"] = post_to_reddit(
                reddit_data, reddit_client_id, reddit_client_secret,
                reddit_username, reddit_password,
            )

            vps_host = get_env("POLLY_VPS_HOST", required=False)
            vps_user = get_env("POLLY_VPS_USER", required=False)
            vps_ssh_key = get_env("POLLY_VPS_SSH_KEY", required=False)

            if vps_host and vps_user and vps_ssh_key:
                print("  Reddit (VPS deployment)...")
                deploy_reddit_post(reddit_data, vps_host, vps_user, vps_ssh_key)
            else:
                print("  VPS credentials not configured — skipping VPS deployment")
        else:
            print("  No reddit.json — skipping")
    else:
        print("  Reddit credentials not configured — skipping")

    # Discord
    discord_data = read_weekly_file(f"{weekly_dir}/discord.json", github_token, owner, repo)
    if discord_data and discord_data.get("message"):
        print("  Discord...")
        discord_image = discord_data.get("image", {}).get("url")
        results["discord"] = post_to_discord(discord_webhook, discord_data["message"], discord_image)
    else:
        print("  No discord.json — skipping")

    # Summary
    print("\n  Results:")
    for platform, success in results.items():
        print(f"    {platform}: {'OK' if success else 'FAILED'}")

    failed = [p for p, s in results.items() if not s]
    if failed:
        print(f"\n  WARNING: Failed platforms: {', '.join(failed)}")

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
