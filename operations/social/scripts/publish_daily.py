#!/usr/bin/env python3
"""
Tier 2: Daily Publish

Publishes daily content from the news branch. Two modes via PUBLISH_MODE env var:
  - "buffer": Stage Twitter to Buffer (called by news-generate-summary.yml after generation)
  - "direct": Deploy Reddit to VPS (called by news-publish-social.yml cron at 15:00 UTC)
  - "all" (default): Both

LinkedIn and Instagram are weekly-only (no daily posts).

See operations/social/PIPELINE.md for full architecture.
"""

import os
import sys
from datetime import datetime, timezone, timedelta
from common import (
    deploy_reddit_news_post,
    get_env,
)
from buffer_publish import publish_twitter_post, stage_buffer_posts


def get_target_date() -> str:
    """Get the target date from env var or default to yesterday UTC.
    Matches generate_daily.py which generates content for yesterday."""
    date_str = get_env("TARGET_DATE", required=False)
    if date_str:
        return date_str
    yesterday = datetime.now(timezone.utc) - timedelta(days=1)
    return yesterday.strftime("%Y-%m-%d")


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

    # ── Buffer staging (Twitter) ─────────────────────────────────
    if publish_mode in ("buffer", "all"):
        buffer_token = get_env("BUFFER_ACCESS_TOKEN")
        print(f"\n[Buffer] Staging to Buffer...")
        buffer_results = stage_buffer_posts(
            daily_dir,
            {"twitter": publish_twitter_post},
            buffer_token,
            github_token,
            owner,
            repo,
        )
        results.update(buffer_results)
        for platform, success in buffer_results.items():
            status = "OK" if success else "FAILED"
            print(f"  {platform}: {status}")

    # ── Direct channels (Reddit) ─────────────────────────────────
    if publish_mode in ("direct", "all"):
        print(f"\n[Direct] Deploying Reddit to VPS...")
        reddit_result = deploy_reddit_news_post(
            daily_dir, github_token, owner, repo
        )
        if reddit_result is not None:
            results["reddit"] = reddit_result

    failed = [p for p, s in results.items() if not s]
    if failed:
        print(f"\n=== Done with failures: {', '.join(failed)} ===")
        sys.exit(1)

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
