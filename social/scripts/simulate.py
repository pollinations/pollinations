#!/usr/bin/env python3
"""
Local simulation of the social pipeline (gists + daily + weekly).

Runs AI generation steps locally and saves results to disk.
No GitHub API calls — no PRs, no branch commits.

Usage:
    # Regenerate gist AI analysis for existing gists
    python social/scripts/simulate.py gists 2026-02-05 2026-02-11

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
    For gists mode: optionally GITHUB_TOKEN for higher rate limits
"""

import os
import sys
import json
import time
import argparse
import requests
from datetime import datetime, timedelta
from pathlib import Path

# Add scripts dir to path
sys.path.insert(0, str(Path(__file__).parent))

from common import (
    read_gists_for_date,
    generate_image,
    IMAGE_SIZE,
)
from generate_realtime import analyze_pr, build_full_gist
from generate_daily import (
    filter_daily_gists as daily_filter,
    generate_summary,
    generate_twitter_post as daily_twitter,
    generate_instagram_post as daily_instagram,
    generate_reddit_post as daily_reddit,
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


def fetch_pr_public(pr_number: int, github_token: str = None) -> tuple:
    """Fetch PR data + changed files from GitHub API. Works without auth for public repos."""
    headers = {"Accept": "application/vnd.github+json"}
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"

    # Fetch PR data
    pr_resp = requests.get(
        f"https://api.github.com/repos/pollinations/pollinations/pulls/{pr_number}",
        headers=headers, timeout=30,
    )
    if pr_resp.status_code != 200:
        remaining = pr_resp.headers.get("X-RateLimit-Remaining", "?")
        print(f"    GitHub API error for PR #{pr_number}: {pr_resp.status_code} (remaining: {remaining})")
        return None, None

    # Fetch changed files
    files_resp = requests.get(
        f"https://api.github.com/repos/pollinations/pollinations/pulls/{pr_number}/files?per_page=100",
        headers=headers, timeout=30,
    )
    files_summary = "(files unavailable)"
    if files_resp.status_code == 200:
        lines = []
        for f in files_resp.json():
            lines.append(f"  {f.get('status', 'modified')}: {f.get('filename', '')} (+{f.get('additions', 0)}/-{f.get('deletions', 0)})")
        files_summary = "\n".join(lines) if lines else "(no files changed)"

    # Check rate limit and pause if needed
    remaining = int(pr_resp.headers.get("X-RateLimit-Remaining", 100))
    if remaining < 5:
        reset_time = int(pr_resp.headers.get("X-RateLimit-Reset", 0))
        wait = max(0, reset_time - int(time.time())) + 2
        print(f"    Rate limit nearly exhausted ({remaining} left), waiting {wait}s...")
        time.sleep(wait)

    return pr_resp.json(), files_summary


def run_gists(start_date: str, end_date: str, token: str, github_token: str = None) -> None:
    """Regenerate AI analysis for existing gists in a date range."""
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d") if end_date else start

    print(f"\n{'='*60}")
    print(f"  GISTS — {start_date} to {end.strftime('%Y-%m-%d')}")
    print(f"{'='*60}")

    if github_token:
        print("  Using authenticated GitHub API (5,000 req/hr)")
    else:
        print("  Using unauthenticated GitHub API (60 req/hr) — pass --github-token for faster runs")

    current = start
    total = 0
    regenerated = 0

    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        gists = read_gists_for_date(date_str)

        if not gists:
            current += timedelta(days=1)
            continue

        print(f"\n  {date_str}: {len(gists)} gists")
        output_dir = Path("social/news/gists") / date_str

        for gist in gists:
            total += 1
            pr_number = gist["pr_number"]
            print(f"\n    PR #{pr_number}: {gist['title'][:60]}...")

            # Preserve existing image data
            existing_image = gist.get("image", {"url": None, "prompt": None})

            # Fetch PR data from GitHub
            pr_data, files_summary = fetch_pr_public(pr_number, github_token)
            if not pr_data:
                print(f"    Skipping — could not fetch PR data")
                continue

            # Re-run AI analysis with new prompt
            ai_analysis = analyze_pr(pr_data, files_summary, token)
            if not ai_analysis:
                print(f"    AI analysis FAILED — keeping existing gist")
                continue

            # Build new gist (preserves PR metadata from fresh GitHub data)
            new_gist = build_full_gist(pr_data, ai_analysis)

            # Restore existing image URL (don't regenerate images)
            new_gist["image"] = existing_image

            save_json(output_dir, f"PR-{pr_number}.json", new_gist)
            regenerated += 1

        current += timedelta(days=1)

    print(f"\n  Done! Regenerated {regenerated}/{total} gists")


def run_daily(date_str: str, token: str, with_images: bool = True) -> None:
    """Run daily generation for a single date."""
    print(f"\n{'='*60}")
    print(f"  DAILY — {date_str}")
    print(f"{'='*60}")

    # Read gists
    print(f"\n[1/4] Reading gists for {date_str}...")
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
    print(f"\n[2/4] Generating summary...")
    summary = generate_summary(daily_gists, date_str, token)
    if not summary:
        print("  Summary generation FAILED")
        return
    print(f"  {len(summary.get('arcs', []))} arcs: {summary.get('one_liner', '')}")

    # Platform posts
    print(f"\n[3/4] Generating platform posts...")

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

    # Images
    if with_images:
        print(f"\n[4/4] Generating images...")
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
        print(f"\n[4/4] Skipping images (--no-images)")

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
    parser.add_argument("mode", choices=["gists", "daily", "weekly"], help="gists, daily, or weekly")
    parser.add_argument("start_date", help="Date (YYYY-MM-DD)")
    parser.add_argument("end_date", nargs="?", help="End date for date range (optional)")
    parser.add_argument("--no-images", action="store_true", help="Skip image generation")
    parser.add_argument("--token", help="pollinations.ai API token (default: POLLINATIONS_TOKEN env)")
    parser.add_argument("--github-token", help="GitHub token for higher rate limits (default: GITHUB_TOKEN env)")
    args = parser.parse_args()

    token = args.token or os.getenv("POLLINATIONS_TOKEN")
    if not token:
        print("Error: POLLINATIONS_TOKEN env var or --token required")
        sys.exit(1)

    if args.mode == "gists":
        github_token = args.github_token or os.getenv("GITHUB_TOKEN")
        run_gists(args.start_date, args.end_date, token, github_token)

    elif args.mode == "daily":
        if args.end_date:
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
