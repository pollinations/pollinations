#!/usr/bin/env python3
"""
Tier 3: Weekly Publish

Sunday 18:00 UTC cron:
  1. Find the weekly PR for this week (branch: weekly-digest-YYYY-MM-DD)
  2. If not merged → skip
  3. If merged → publish all 5 platforms:
     - Buffer staging: Twitter, LinkedIn, Instagram
     - Reddit via VPS/Devvit deployment
     - Discord webhook post

See social/PIPELINE.md for full architecture.
"""

import os
import sys
import json
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional
import paramiko
import base64 
import io
from common import get_env, github_api_request, GITHUB_API_BASE, deploy_reddit_post, DISCORD_CHAR_LIMIT
from buffer_publish import (
    publish_twitter_post,
    publish_linkedin_post,
    publish_instagram_post,
)

# ── Constants ────────────────────────────────────────────────────────

WEEKLY_REL_DIR = "social/news/weekly"
DISCORD_CHUNK_SIZE = 1900


# ── Helpers ──────────────────────────────────────────────────────────

def get_last_sunday() -> str:
    """Get the date of the most recent Sunday (the week_end for the weekly summary).
    The weekly covers Mon→Sun. This runs on Sunday 18:00 UTC,
    so 'last Sunday' is today."""
    today = datetime.now(timezone.utc).date()
    # Sunday = weekday 6. Find most recent Sunday (including today).
    days_since_sunday = (today.weekday() - 6) % 7
    sunday = today - timedelta(days=days_since_sunday)
    return sunday.strftime("%Y-%m-%d")


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

    owner, repo = repo_full.split("/")
    week_end = week_end_override or get_last_sunday()
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

    # Reddit (VPS/Devvit deployment)
    vps_host = get_env("REDDIT_VPS_HOST", required=False)
    vps_user = get_env("REDDIT_VPS_USER", required=False)
    vps_ssh_key = get_env("REDDIT_VPS_SSH_KEY", required=False).strip()
    private_key_str = base64.b64decode(vps_ssh_key).decode("utf-8")
    key_file = io.StringIO(private_key_str)
    pkey = paramiko.Ed25519Key.from_private_key(key_file)

    if vps_host and vps_user and vps_ssh_key:
        reddit_data = read_weekly_file(f"{weekly_dir}/reddit.json", github_token, owner, repo)
        if reddit_data:
            print("  Reddit...")
            results["reddit"] = deploy_reddit_post(reddit_data, vps_host, vps_user, pkey)
        else:
            print("  No reddit.json — skipping")
    else:
        print("  Reddit VPS credentials not configured — skipping")

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
