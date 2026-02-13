#!/usr/bin/env python3
"""
Backfill missing gists and daily summaries by fetching real PRs from GitHub.

Runs the same pipeline as the GitHub workflows but saves outputs locally
instead of committing via the GitHub API.

Usage:
    # Default: backfill Feb 12+13 gists, daily for Feb 12
    GITHUB_TOKEN=... POLLINATIONS_TOKEN=... python3 social/scripts/backfill.py

    # Skip image generation (faster)
    GITHUB_TOKEN=... POLLINATIONS_TOKEN=... python3 social/scripts/backfill.py --skip-images

    # Custom dates + daily
    GITHUB_TOKEN=... POLLINATIONS_TOKEN=... python3 social/scripts/backfill.py \
        --dates 2026-02-12 2026-02-13 --daily 2026-02-12
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Add scripts dir to path
sys.path.insert(0, str(Path(__file__).parent))

from common import (
    GITHUB_API_BASE,
    GISTS_REL_DIR,
    OWNER,
    REPO,
    call_pollinations_api,
    filter_daily_gists,
    generate_image,
    generate_platform_post,
    get_repo_root,
    github_api_request,
    parse_json_response,
    read_gists_for_date,
    validate_gist,
    apply_publish_tier_rules,
)
from generate_realtime import analyze_pr, build_full_gist, fetch_pr_data, fetch_pr_files
from generate_daily import generate_summary

REPO_ROOT = Path(get_repo_root())

# Bot authors whose PRs are pipeline output, not input
BOT_AUTHORS = {"app/pollinations-ai", "pollinations-ai[bot]", "pollinations-ai"}


# ── GitHub PR discovery ─────────────────────────────────────────────

def fetch_merged_prs_for_date(date_str: str, github_token: str) -> list[dict]:
    """Fetch all PRs merged on a specific date, filtering out bot PRs."""
    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github+json",
    }

    # Search for PRs merged on this date
    query = f"repo:{OWNER}/{REPO} is:pr is:merged merged:{date_str}"
    url = f"{GITHUB_API_BASE}/search/issues?q={query}&per_page=100"
    resp = github_api_request("GET", url, headers=headers)
    if resp.status_code != 200:
        print(f"  Search API error: {resp.status_code} {resp.text[:200]}")
        return []

    results = resp.json().get("items", [])

    # Filter out bot-authored PRs (social post PRs are pipeline output)
    real_prs = []
    for item in results:
        author = item.get("user", {}).get("login", "")
        # Also check if it's a social post PR by title pattern
        title = item.get("title", "")
        is_social_post = any(
            title.startswith(f"{p} Post - ") for p in ["Twitter", "Instagram", "LinkedIn", "Reddit", "Discord"]
        )
        if author in BOT_AUTHORS or is_social_post:
            print(f"  Skipping bot PR #{item['number']}: {title}")
            continue
        real_prs.append(item)

    # Sort by merge time (we'll get this from full PR data later)
    real_prs.sort(key=lambda p: p["number"])
    return real_prs


# ── Tier 1: Gist generation ────────────────────────────────────────

def generate_gist_for_pr(
    pr_number: int,
    date_str: str,
    github_token: str,
    pollinations_token: str,
    skip_images: bool = False,
) -> dict | None:
    """Generate a gist for a single PR and save it locally."""
    repo_full = f"{OWNER}/{REPO}"
    gist_dir = REPO_ROOT / GISTS_REL_DIR / date_str
    gist_dir.mkdir(parents=True, exist_ok=True)

    gist_file = gist_dir / f"PR-{pr_number}.json"
    if gist_file.exists():
        print(f"  Gist already exists: {gist_file.name} — skipping")
        with open(gist_file) as f:
            return json.load(f)

    # Fetch PR data from GitHub
    print(f"  Fetching PR #{pr_number} data...")
    pr_data = fetch_pr_data(repo_full, str(pr_number), github_token)
    files_summary = fetch_pr_files(repo_full, str(pr_number), github_token)

    # AI analysis
    print(f"  Analyzing PR #{pr_number}...")
    ai_analysis = analyze_pr(pr_data, files_summary, pollinations_token)

    if ai_analysis:
        gist = build_full_gist(pr_data, ai_analysis)
        gist["gist"]["publish_tier"] = apply_publish_tier_rules(gist)
        errors = validate_gist(gist)
        if errors:
            print(f"  Schema warnings: {errors}")
    else:
        print(f"  AI analysis failed — using minimal gist")
        from common import build_minimal_gist
        labels = [l["name"] for l in pr_data.get("labels", [])]
        gist = build_minimal_gist(
            pr_number, pr_data["title"],
            pr_data.get("user", {}).get("login", "unknown"),
            pr_data["html_url"],
            pr_data.get("merged_at", datetime.now(timezone.utc).isoformat()),
            labels,
        )

    # Save gist JSON locally
    with open(gist_file, "w", encoding="utf-8") as f:
        json.dump(gist, f, indent=2, ensure_ascii=False)
    print(f"  Saved {gist_file.name}")

    # Generate image
    if not skip_images:
        image_prompt = gist.get("gist", {}).get("image_prompt", "")
        if image_prompt:
            print(f"  Generating image...")
            image_bytes, _ = generate_image(image_prompt, pollinations_token)
            if image_bytes:
                image_file = gist_dir / f"PR-{pr_number}.jpg"
                with open(image_file, "wb") as f:
                    f.write(image_bytes)
                kb = len(image_bytes) / 1024
                print(f"  Saved {image_file.name} ({kb:.0f} KB)")

                # Update gist with local image path
                gist["image"] = {
                    "url": f"social/news/gists/{date_str}/PR-{pr_number}.jpg",
                    "prompt": image_prompt,
                }
                with open(gist_file, "w", encoding="utf-8") as f:
                    json.dump(gist, f, indent=2, ensure_ascii=False)
            else:
                print(f"  Image generation failed — continuing without")

    tier = gist.get("gist", {}).get("publish_tier", "?")
    importance = gist.get("gist", {}).get("importance", "?")
    print(f"  Done: publish_tier={tier}, importance={importance}")
    return gist


def backfill_gists(
    date_str: str,
    github_token: str,
    pollinations_token: str,
    skip_images: bool = False,
) -> list[dict]:
    """Generate gists for all real PRs merged on a date."""
    print(f"\n{'='*60}")
    print(f"TIER 1: Generating gists for {date_str}")
    print(f"{'='*60}")

    prs = fetch_merged_prs_for_date(date_str, github_token)
    print(f"  Found {len(prs)} real PRs for {date_str}")

    if not prs:
        print("  No PRs to process")
        return []

    gists = []
    for i, pr_item in enumerate(prs, 1):
        pr_num = pr_item["number"]
        title = pr_item["title"][:60]
        print(f"\n  [{i}/{len(prs)}] PR #{pr_num}: {title}")

        gist = generate_gist_for_pr(
            pr_num, date_str, github_token, pollinations_token, skip_images
        )
        if gist:
            gists.append(gist)

        # Rate limiting between PRs
        if i < len(prs):
            time.sleep(2)

    print(f"\n  Generated {len(gists)} gists for {date_str}")
    return gists


# ── Tier 2: Daily summary ──────────────────────────────────────────

def backfill_daily(
    date_str: str,
    pollinations_token: str,
    skip_images: bool = False,
) -> bool:
    """Generate daily summary + platform posts for a date."""
    print(f"\n{'='*60}")
    print(f"TIER 2: Generating daily summary for {date_str}")
    print(f"{'='*60}")

    # Read gists from local repo
    gists = read_gists_for_date(date_str)
    if not gists:
        print(f"  No gists found for {date_str}. Run gist generation first.")
        return False

    daily_gists = filter_daily_gists(gists)
    print(f"  {len(gists)} total gists, {len(daily_gists)} with publish_tier=daily")

    if not daily_gists:
        print("  No daily-tier gists — skipping")
        return False

    # Generate summary
    print("\n  [1/4] Generating daily summary...")
    summary = generate_summary(daily_gists, date_str, pollinations_token)
    if not summary:
        print("  Summary generation failed!")
        return False

    arcs = summary.get("arcs", [])
    print(f"  {len(arcs)} arcs: {summary.get('one_liner', '')[:80]}")

    # Generate platform posts
    print("\n  [2/4] Generating Twitter post...")
    twitter_post = generate_platform_post(
        "twitter", summary, pollinations_token,
        "Write a tweet about today's shipped work.", temperature=0.8
    )
    if twitter_post:
        tweet = twitter_post.get("tweet", "")
        print(f"  Tweet ({len(tweet)} chars): {tweet[:80]}...")

    print("\n  [3/4] Generating Instagram post...")
    instagram_post = generate_platform_post(
        "instagram", summary, pollinations_token,
        "Create a cozy pixel art post about these updates."
    )
    if instagram_post:
        img_count = len(instagram_post.get("images", []))
        print(f"  Instagram: {img_count} images")

    print("\n  [4/4] Generating Reddit post...")
    reddit_post = generate_platform_post(
        "reddit", summary, pollinations_token,
        "Create a Reddit post for today's update."
    )
    if reddit_post:
        print(f"  Reddit: {reddit_post.get('title', '')[:80]}")

    # Save daily output
    daily_dir = REPO_ROOT / "social" / "news" / "daily" / date_str
    daily_dir.mkdir(parents=True, exist_ok=True)
    images_dir = daily_dir / "images"
    images_dir.mkdir(exist_ok=True)

    for platform, post in [("twitter", twitter_post), ("instagram", instagram_post), ("reddit", reddit_post)]:
        if post:
            post["date"] = date_str
            post["generated_at"] = datetime.now(timezone.utc).isoformat()
            post["platform"] = platform
            out_file = daily_dir / f"{platform}.json"
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(post, f, indent=2, ensure_ascii=False)
            print(f"  Saved {platform}.json")

    # Generate images
    if not skip_images:
        print("\n  Generating platform images...")

        # Twitter image
        if twitter_post and twitter_post.get("image_prompt"):
            print("  Generating Twitter image...")
            img_bytes, _ = generate_image(twitter_post["image_prompt"], pollinations_token)
            if img_bytes:
                with open(images_dir / "twitter.jpg", "wb") as f:
                    f.write(img_bytes)
                print(f"  Saved twitter.jpg ({len(img_bytes)/1024:.0f} KB)")

        # Instagram images (carousel)
        if instagram_post and instagram_post.get("images"):
            for i, img_info in enumerate(instagram_post["images"][:3]):
                prompt = img_info.get("prompt", "")
                if not prompt:
                    continue
                print(f"  Generating Instagram image {i+1}...")
                img_bytes, _ = generate_image(prompt, pollinations_token, index=i)
                if img_bytes:
                    with open(images_dir / f"instagram-{i+1}.jpg", "wb") as f:
                        f.write(img_bytes)
                    print(f"  Saved instagram-{i+1}.jpg ({len(img_bytes)/1024:.0f} KB)")
                time.sleep(3)

        # Reddit image
        if reddit_post and reddit_post.get("image_prompt"):
            print("  Generating Reddit image...")
            img_bytes, _ = generate_image(reddit_post["image_prompt"], pollinations_token)
            if img_bytes:
                with open(images_dir / "reddit.jpg", "wb") as f:
                    f.write(img_bytes)
                print(f"  Saved reddit.jpg ({len(img_bytes)/1024:.0f} KB)")

    print(f"\n  Daily output saved to {daily_dir}")
    return True


# ── Main ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Backfill missing gists and daily summaries")
    parser.add_argument(
        "--dates", nargs="+", default=["2026-02-12", "2026-02-13"],
        help="Dates to backfill gists for (YYYY-MM-DD)"
    )
    parser.add_argument(
        "--daily", nargs="*", default=["2026-02-12"],
        help="Dates to generate daily summaries for (default: 2026-02-12)"
    )
    parser.add_argument(
        "--skip-images", action="store_true",
        help="Skip image generation (faster)"
    )
    args = parser.parse_args()

    github_token = os.getenv("GITHUB_TOKEN")
    pollinations_token = os.getenv("POLLINATIONS_TOKEN")

    if not github_token:
        print("Error: set GITHUB_TOKEN env var")
        sys.exit(1)
    if not pollinations_token:
        print("Error: set POLLINATIONS_TOKEN env var")
        sys.exit(1)

    print("=" * 60)
    print(f"Pipeline Backfill")
    print(f"  Dates: {', '.join(args.dates)}")
    print(f"  Daily: {', '.join(args.daily) if args.daily else 'none'}")
    print(f"  Images: {'skip' if args.skip_images else 'generate'}")
    print("=" * 60)

    t0 = time.time()
    results = {}

    # Tier 1: Generate gists for all dates
    for date_str in args.dates:
        ts = time.time()
        gists = backfill_gists(date_str, github_token, pollinations_token, args.skip_images)
        elapsed = time.time() - ts
        results[f"gists-{date_str}"] = (len(gists), f"{elapsed:.1f}s")

    # Tier 2: Generate daily summaries
    for date_str in (args.daily or []):
        ts = time.time()
        ok = backfill_daily(date_str, pollinations_token, args.skip_images)
        elapsed = time.time() - ts
        results[f"daily-{date_str}"] = ("OK" if ok else "FAIL", f"{elapsed:.1f}s")

    total = time.time() - t0

    print(f"\n{'='*60}")
    print("RESULTS")
    print("=" * 60)
    for label, (status, elapsed) in results.items():
        print(f"  {label:30s} {str(status):6s} ({elapsed})")
    print(f"\n  Total: {total:.1f}s")


if __name__ == "__main__":
    main()
