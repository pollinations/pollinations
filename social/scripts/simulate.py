#!/usr/bin/env python3
"""
Local simulation of the social pipeline (daily + weekly).

Runs AI generation steps locally and saves results to disk.
No GitHub API calls — no PRs, no branch commits.

Usage:
    # Generate daily for a specific date
    python social/scripts/simulate.py daily 2026-02-11

    # Generate daily for all dates in range
    python social/scripts/simulate.py daily 2026-02-05 2026-02-11

    # Generate weekly for a week starting Monday
    python social/scripts/simulate.py weekly 2026-02-05

    # Skip image generation (faster, text-only)
    python social/scripts/simulate.py daily 2026-02-11 --no-images

Requires:
    POLLINATIONS_TOKEN env var (or pass via --token)
"""

import os
import sys
import json
import argparse
from datetime import datetime, timedelta
from pathlib import Path

# Add scripts dir to path
sys.path.insert(0, str(Path(__file__).parent))

from common import (
    read_gists_for_date,
    generate_image,
    IMAGE_SIZE,
)
from generate_daily import (
    filter_daily_gists as daily_filter,
    generate_summary,
    generate_twitter_post as daily_twitter,
    generate_instagram_post as daily_instagram,
    generate_reddit_post as daily_reddit,
    generate_diary,
)
from generate_weekly import (
    get_week_range,
    read_gists_for_week,
    filter_daily_gists as weekly_filter,
    generate_digest,
    generate_twitter_post as weekly_twitter,
    generate_linkedin_post as weekly_linkedin,
    generate_instagram_post as weekly_instagram,
    generate_reddit_post as weekly_reddit,
    generate_discord_post as weekly_discord,
)


def save_json(output_dir: Path, filename: str, data: dict) -> None:
    """Save JSON to local file."""
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / filename
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"    Saved {path}")


def save_image(output_dir: Path, filename: str, img_bytes: bytes) -> None:
    """Save image bytes to local file."""
    images_dir = output_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    path = images_dir / filename
    path.write_bytes(img_bytes)
    print(f"    Saved {path} ({len(img_bytes)} bytes)")


def run_daily(date_str: str, token: str, with_images: bool = True) -> None:
    """Run daily generation for a single date."""
    print(f"\n{'='*60}")
    print(f"  DAILY — {date_str}")
    print(f"{'='*60}")

    # Read gists
    print(f"\n[1/5] Reading gists for {date_str}...")
    gists = read_gists_for_date(date_str)
    if not gists:
        print(f"  No gists found for {date_str}. Skipping.")
        return

    daily_gists = daily_filter(gists)
    print(f"  {len(gists)} total gists, {len(daily_gists)} daily-tier")

    if not daily_gists:
        print("  No daily-tier gists. Skipping.")
        return

    output_dir = Path("social/news/daily") / date_str

    # Summary
    print(f"\n[2/5] Generating summary...")
    summary = generate_summary(daily_gists, date_str, token)
    if not summary:
        print("  Summary generation FAILED")
        return
    print(f"  {len(summary.get('arcs', []))} arcs: {summary.get('one_liner', '')}")
    save_json(output_dir, "summary.json", summary)

    # Platform posts
    print(f"\n[3/5] Generating platform posts...")

    print("  Twitter...")
    twitter = daily_twitter(summary, token)
    if twitter:
        save_json(output_dir, "twitter.json", twitter)
        tweet = twitter.get("tweet", "")
        print(f"    Tweet ({len(tweet)} chars): {tweet[:100]}...")

    print("  Instagram...")
    instagram = daily_instagram(summary, token)
    if instagram:
        save_json(output_dir, "instagram.json", instagram)
        print(f"    {len(instagram.get('images', []))} carousel images")

    print("  Reddit...")
    reddit = daily_reddit(summary, token)
    if reddit:
        save_json(output_dir, "reddit.json", reddit)
        print(f"    Title: {reddit.get('title', '')[:80]}")

    # Diary
    print(f"\n[4/5] Generating diary...")
    diary = generate_diary(daily_gists, date_str, token)
    if diary:
        save_json(output_dir, "diary.json", diary)
        print(f"    Mood: {diary.get('mood', 'unknown')}")

    # Images
    if with_images:
        print(f"\n[5/5] Generating images...")
        if twitter and twitter.get("image_prompt"):
            img_bytes, _ = generate_image(twitter["image_prompt"], token, IMAGE_SIZE, IMAGE_SIZE)
            if img_bytes:
                save_image(output_dir, "twitter.jpg", img_bytes)

        if instagram and instagram.get("images"):
            for i, img_info in enumerate(instagram["images"][:3]):
                prompt = img_info.get("prompt", "")
                if prompt:
                    img_bytes, _ = generate_image(prompt, token, IMAGE_SIZE, IMAGE_SIZE, i)
                    if img_bytes:
                        save_image(output_dir, f"instagram-{i+1}.jpg", img_bytes)

        if reddit and reddit.get("image_prompt"):
            img_bytes, _ = generate_image(reddit["image_prompt"], token, IMAGE_SIZE, IMAGE_SIZE)
            if img_bytes:
                save_image(output_dir, "reddit.jpg", img_bytes)
    else:
        print(f"\n[5/5] Skipping images (--no-images)")

    print(f"\n  Done! Output in {output_dir}/")


def run_weekly(week_start: str, token: str, with_images: bool = True) -> None:
    """Run weekly generation for a week starting on the given Monday."""
    week_start, week_end = get_week_range(week_start)

    print(f"\n{'='*60}")
    print(f"  WEEKLY — {week_start} to {week_end}")
    print(f"{'='*60}")

    # Read gists
    print(f"\n[1/4] Reading gists for week...")
    all_gists = read_gists_for_week(week_start, week_end)
    daily_gists = weekly_filter(all_gists)
    print(f"  {len(all_gists)} total gists, {len(daily_gists)} daily-tier")

    if not daily_gists:
        print("  No daily-tier gists. Skipping.")
        return

    output_dir = Path("social/news/weekly") / week_end

    # Digest
    print(f"\n[2/4] Generating weekly digest...")
    digest = generate_digest(daily_gists, week_start, week_end, token)
    if not digest:
        print("  Digest generation FAILED")
        return
    print(f"  Theme: {digest.get('theme', '')}")
    print(f"  {len(digest.get('arcs', []))} arcs, {digest.get('pr_count', 0)} PRs")
    save_json(output_dir, "digest.json", digest)

    # Save changelog
    changelog = digest.get("changelog_md", "")
    if changelog:
        path = output_dir / "summary.md"
        output_dir.mkdir(parents=True, exist_ok=True)
        path.write_text(changelog)
        print(f"    Saved {path}")

    # Platform posts
    print(f"\n[3/4] Generating platform posts...")

    print("  Twitter...")
    twitter = weekly_twitter(digest, token)
    if twitter:
        save_json(output_dir, "twitter.json", twitter)

    print("  LinkedIn...")
    linkedin = weekly_linkedin(digest, token)
    if linkedin:
        save_json(output_dir, "linkedin.json", linkedin)

    print("  Instagram...")
    instagram = weekly_instagram(digest, token)
    if instagram:
        save_json(output_dir, "instagram.json", instagram)

    print("  Reddit...")
    reddit = weekly_reddit(digest, token)
    if reddit:
        save_json(output_dir, "reddit.json", reddit)

    print("  Discord...")
    discord = weekly_discord(digest, token, week_end)
    if discord:
        save_json(output_dir, "discord.json", discord)

    # Images
    if with_images:
        print(f"\n[4/4] Generating images...")
        for name, post in [("twitter", twitter), ("linkedin", linkedin), ("reddit", reddit), ("discord", discord)]:
            if post and post.get("image_prompt"):
                img_bytes, _ = generate_image(post["image_prompt"], token, IMAGE_SIZE, IMAGE_SIZE)
                if img_bytes:
                    save_image(output_dir, f"{name}.jpg", img_bytes)

        if instagram and instagram.get("images"):
            for i, img_info in enumerate(instagram["images"][:3]):
                prompt = img_info.get("prompt", "")
                if prompt:
                    img_bytes, _ = generate_image(prompt, token, IMAGE_SIZE, IMAGE_SIZE, i)
                    if img_bytes:
                        save_image(output_dir, f"instagram-{i+1}.jpg", img_bytes)
    else:
        print(f"\n[4/4] Skipping images (--no-images)")

    print(f"\n  Done! Output in {output_dir}/")


def main():
    parser = argparse.ArgumentParser(description="Simulate social pipeline locally")
    parser.add_argument("mode", choices=["daily", "weekly"], help="daily or weekly")
    parser.add_argument("start_date", help="Date (YYYY-MM-DD)")
    parser.add_argument("end_date", nargs="?", help="End date for daily range (optional)")
    parser.add_argument("--no-images", action="store_true", help="Skip image generation")
    parser.add_argument("--token", help="pollinations.ai API token (default: POLLINATIONS_TOKEN env)")
    args = parser.parse_args()

    token = args.token or os.getenv("POLLINATIONS_TOKEN")
    if not token:
        print("Error: POLLINATIONS_TOKEN env var or --token required")
        sys.exit(1)

    if args.mode == "daily":
        if args.end_date:
            # Date range
            start = datetime.strptime(args.start_date, "%Y-%m-%d")
            end = datetime.strptime(args.end_date, "%Y-%m-%d")
            current = start
            while current <= end:
                run_daily(current.strftime("%Y-%m-%d"), token, not args.no_images)
                current += timedelta(days=1)
        else:
            run_daily(args.start_date, token, not args.no_images)

    elif args.mode == "weekly":
        run_weekly(args.start_date, token, not args.no_images)


if __name__ == "__main__":
    main()
