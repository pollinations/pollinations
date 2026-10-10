#!/usr/bin/env python3
"""
Tier 2: Daily Publish

Stages the daily Twitter post from the news branch to Buffer
(called by news-generate-summary.yml after generation).

LinkedIn and Instagram are weekly-only (no daily posts).

See operations/social/PIPELINE.md for full architecture.
"""

import os
import sys
from datetime import datetime, timezone, timedelta
from common import (
    get_env,
    NEWS_REL_DIR,
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
    buffer_token = get_env("BUFFER_ACCESS_TOKEN")

    owner, repo = repo_full.split("/")
    date_str = get_target_date()
    daily_dir = os.path.join(NEWS_REL_DIR, "daily", date_str)

    print(f"  Date: {date_str}")
    print(f"  Dir: {daily_dir}")

    print("\n[Buffer] Staging to Buffer...")
    results = stage_buffer_posts(
        daily_dir,
        {"twitter": publish_twitter_post},
        buffer_token,
        github_token,
        owner,
        repo,
    )
    for platform, success in results.items():
        status = "OK" if success else "FAILED"
        print(f"  {platform}: {status}")

    failed = [p for p, s in results.items() if not s]
    if failed:
        print(f"\n=== Done with failures: {', '.join(failed)} ===")
        sys.exit(1)

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
