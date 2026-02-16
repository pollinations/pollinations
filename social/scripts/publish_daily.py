#!/usr/bin/env python3
"""
Tier 2: Daily Publish

Publishes daily content from the news branch. Two modes via PUBLISH_MODE env var:
  - "buffer": Stage Twitter + Instagram to Buffer (called by NEWS_summary.yml after generation)
  - "direct": Deploy Reddit to VPS (called by NEWS_publish.yml cron at 15:00 UTC)
  - "all" (default): Both

LinkedIn is weekly-only (no daily posts).

See social/PIPELINE.md for full architecture.
"""

import os
import sys
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional
import base64
import io
from common import (
    get_env,
    read_news_file,
    deploy_reddit_post,
)
from buffer_publish import (
    publish_twitter_post,
    publish_instagram_post,
)

# Paths
DAILY_DIR = "social/news/daily"


def get_target_date() -> str:
    """Get the target date from env var or default to yesterday UTC.
    Matches generate_daily.py which generates content for yesterday."""
    date_str = get_env("TARGET_DATE", required=False)
    if date_str:
        return date_str
    yesterday = datetime.now(timezone.utc) - timedelta(days=1)
    return yesterday.strftime("%Y-%m-%d")


def stage_buffer_posts(daily_dir: str, buffer_token: str, github_token: str, owner: str, repo: str) -> Dict[str, bool]:
    """Stage all platform posts to Buffer. Returns {platform: success}."""
    results = {}

    for platform, filename, publish_fn in [
        ("twitter", "twitter.json", publish_twitter_post),
        ("instagram", "instagram.json", publish_instagram_post),
    ]:
        post_path = os.path.join(daily_dir, filename)
        post_data = read_news_file(post_path, github_token, owner, repo)

        if not post_data:
            print(f"  No {filename} found — skipping {platform}")
            continue

        print(f"\n  Staging {platform}...")
        try:
            results[platform] = publish_fn(post_data, buffer_token)
        except Exception as e:
            print(f"  Error staging {platform}: {e}")
            results[platform] = False

    return results


# ── Main ─────────────────────────────────────────────────────────────

def main():
    print("=== Tier 2: Daily Publish ===")

    github_token = get_env("GITHUB_TOKEN")
    repo_full = get_env("GITHUB_REPOSITORY")
    publish_mode = get_env("PUBLISH_MODE", required=False) or "all"

    owner, repo = repo_full.split("/")
    date_str = get_target_date()
    daily_dir = os.path.join("social", "news", "daily", date_str)

    print(f"  Date: {date_str}")
    print(f"  Mode: {publish_mode}")
    print(f"  Dir: {daily_dir}")

    results = {}

    # ── Buffer staging (Twitter + Instagram) ─────────────────────
    if publish_mode in ("buffer", "all"):
        buffer_token = get_env("BUFFER_ACCESS_TOKEN")
        print(f"\n[Buffer] Staging to Buffer...")
        buffer_results = stage_buffer_posts(daily_dir, buffer_token, github_token, owner, repo)
        results.update(buffer_results)
        for platform, success in buffer_results.items():
            status = "OK" if success else "FAILED"
            print(f"  {platform}: {status}")

    # ── Direct channels (Reddit) ─────────────────────────────────
    if publish_mode in ("direct", "all"):
        print(f"\n[Direct] Deploying Reddit to VPS...")
        vps_host = get_env("REDDIT_VPS_HOST", required=False)
        vps_user = get_env("REDDIT_VPS_USER", required=False)
        vps_ssh_key_raw = get_env("REDDIT_VPS_SSH_KEY", required=False)
        vps_ssh_key = vps_ssh_key_raw.strip() if vps_ssh_key_raw else None

        if vps_host and vps_user and vps_ssh_key:
            import paramiko
            private_key_str = base64.b64decode(vps_ssh_key).decode("utf-8")
            key_file = io.StringIO(private_key_str)
            pkey = paramiko.Ed25519Key.from_private_key(key_file)

            reddit_path = os.path.join(daily_dir, "reddit.json")
            reddit_data = read_news_file(reddit_path, github_token, owner, repo)

            if reddit_data:
                results["reddit"] = deploy_reddit_post(reddit_data, vps_host, vps_user, pkey)
            else:
                print("  No reddit.json — skipping VPS deployment")
        else:
            print("  VPS credentials not configured — skipping VPS deployment")

    failed = [p for p, s in results.items() if not s]
    if failed:
        print(f"\n=== Done with failures: {', '.join(failed)} ===")
        sys.exit(1)

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
