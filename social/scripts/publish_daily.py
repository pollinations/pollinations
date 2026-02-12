#!/usr/bin/env python3
"""
Tier 2: Daily Publish

Triggered when a daily summary PR is merged. Does two things:
  1. Buffer staging for Twitter, Instagram
  2. Deploy Reddit post to VPS

LinkedIn is weekly-only (no daily posts).
Highlights + README are updated by the separate NEWS_highlights_update workflow.
"""

import os
import sys
import json
from datetime import datetime, timezone
from typing import Dict, Optional
import paramiko
import base64
import io
from common import (
    get_env,
    github_api_request,
    GITHUB_API_BASE,
    deploy_reddit_post,
)
from buffer_publish import (
    publish_twitter_post,
    publish_instagram_post,
    add_pr_comment,
)

# Paths
DAILY_DIR = "social/news/daily"


def find_daily_date_from_pr(github_token: str, repo: str, pr_number: int) -> Optional[str]:
    """Detect the daily date from files changed in the merged PR."""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
    }
    resp = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{repo}/pulls/{pr_number}/files",
        headers=headers,
    )
    if resp.status_code != 200:
        return None

    for f in resp.json():
        filename = f.get("filename", "")
        # Match social/news/daily/YYYY-MM-DD/anything
        if filename.startswith(f"{DAILY_DIR}/"):
            parts = filename.split("/")
            # Expected: social/news/daily/YYYY-MM-DD/file.json → parts[3] = date
            if len(parts) >= 5:
                return parts[3]  # YYYY-MM-DD
    return None


def stage_buffer_posts(daily_dir: str, buffer_token: str) -> Dict[str, bool]:
    """Stage all platform posts to Buffer. Returns {platform: success}."""
    results = {}

    for platform, filename, publish_fn in [
        ("twitter", "twitter.json", publish_twitter_post),
        ("instagram", "instagram.json", publish_instagram_post),
    ]:
        post_path = os.path.join(daily_dir, filename)
        if not os.path.exists(post_path):
            print(f"  No {filename} found — skipping {platform}")
            continue

        print(f"\n  Staging {platform}...")
        try:
            with open(post_path, "r", encoding="utf-8") as f:
                post_data = json.load(f)
            results[platform] = publish_fn(post_data, buffer_token)
        except Exception as e:
            print(f"  Error staging {platform}: {e}")
            results[platform] = False

    return results


# ── Main ─────────────────────────────────────────────────────────────

def main():
    print("=== Tier 2: Daily Publish ===")

    github_token = get_env("GITHUB_TOKEN")
    buffer_token = get_env("BUFFER_ACCESS_TOKEN")
    repo_full = get_env("GITHUB_REPOSITORY")
    pr_number_str = get_env("PR_NUMBER", required=False)
    pr_number = int(pr_number_str) if pr_number_str else None

    owner, repo = repo_full.split("/")

    # Detect date from PR files
    date_str = None
    if pr_number:
        date_str = find_daily_date_from_pr(github_token, repo_full, pr_number)
    if not date_str:
        date_str = get_env("TARGET_DATE", required=False)
    if not date_str:
        print("Error: Could not determine daily date from PR or TARGET_DATE")
        sys.exit(1)

    daily_dir = os.path.join("social", "news", "daily", date_str)
    print(f"  Date: {date_str}")
    print(f"  Dir: {daily_dir}")

    # ── 1. Buffer staging (Twitter + Instagram) ─────────────────────
    print(f"\n[1/2] Staging to Buffer...")
    results = stage_buffer_posts(daily_dir, buffer_token)
    for platform, success in results.items():
        status = "OK" if success else "FAILED"
        print(f"  {platform}: {status}")

    # ── 2. Deploy Reddit to VPS ────────────────────────────────────
    print(f"\n[2/2] Deploying Reddit to VPS...")
    vps_host = get_env("REDDIT_VPS_HOST", required=False)
    vps_user = get_env("REDDIT_VPS_USER", required=False)
    vps_ssh_key = get_env("REDDIT_VPS_SSH_KEY", required=False)
    vps_ssh_key = get_env("REDDIT_VPS_SSH_KEY", required=False).strip()
    private_key_str = base64.b64decode(vps_ssh_key).decode("utf-8")
    key_file = io.StringIO(private_key_str)
    pkey = paramiko.Ed25519Key.from_private_key(key_file)

    if vps_host and vps_user and vps_ssh_key:
        reddit_data = {}
        reddit_path = os.path.join(daily_dir, "reddit.json")
        if os.path.exists(reddit_path):
            with open(reddit_path, "r", encoding="utf-8") as f:
                reddit_data = json.load(f)

        if reddit_data:
            deploy_reddit_post(reddit_data, vps_host, vps_user, pkey)
        else:
            print("  No reddit.json — skipping VPS deployment")
    else:
        print("  VPS credentials not configured — skipping VPS deployment")

    # PR comment
    if pr_number:
        buffer_platforms = [p for p, s in results.items() if s]
        failed = [p for p, s in results.items() if not s]
        msg = f"Daily publish complete for {date_str}.\n"
        if buffer_platforms:
            msg += f"- Staged to Buffer: {', '.join(buffer_platforms)}\n"
        if failed:
            msg += f"- Failed: {', '.join(failed)}\n"
        msg += "- Highlights + README updated by separate workflow"
        add_pr_comment(github_token, repo_full, pr_number, msg)

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
