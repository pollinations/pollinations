#!/usr/bin/env python3
"""
Backfill missing gists, daily summaries, and weekly summaries by fetching real PRs from GitHub.

Runs the same pipeline as the GitHub workflows but saves outputs locally
instead of committing via the GitHub API.

Usage:
    # Default: backfill Feb 12+13 gists, daily for Feb 12
    GITHUB_TOKEN=... POLLINATIONS_TOKEN=... python3 social/scripts/backfill.py

    # Custom dates + daily
    GITHUB_TOKEN=... POLLINATIONS_TOKEN=... python3 social/scripts/backfill.py \
        --dates 2026-02-12 2026-02-13 --daily 2026-02-12

    # Weekly by Sunday publish date
    GITHUB_TOKEN=... POLLINATIONS_TOKEN=... python3 social/scripts/backfill.py \
        --weekly 2026-03-15
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
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
    normalize_platform_post,
    parse_json_response,
    read_gists_for_date,
    validate_gist,
    apply_publish_tier_rules,
)
from generate_realtime import analyze_pr, build_full_gist, fetch_pr_data, fetch_pr_files
from generate_daily import build_daily_summary_artifact, generate_summary
from generate_weekly import (
    build_weekly_summary_artifact,
    generate_digest,
    generate_discord_post,
    generate_instagram_post as generate_weekly_instagram_post,
    generate_linkedin_post,
    generate_reddit_post as generate_weekly_reddit_post,
    generate_twitter_post as generate_weekly_twitter_post,
    read_gists_for_week,
)

REPO_ROOT = Path(get_repo_root())
NEWS_RAW_BASE = f"https://raw.githubusercontent.com/{OWNER}/{REPO}/news/social/news"

# Bot authors whose PRs are pipeline output, not input
BOT_AUTHORS = {"app/pollinations-ai", "pollinations-ai[bot]", "pollinations-ai"}


def news_raw_url(repo_rel_path: str) -> str:
    """Build the eventual raw GitHub URL for a file on the news branch."""
    path = repo_rel_path.lstrip("/")
    prefix = "social/news/"
    if path.startswith(prefix):
        path = path[len(prefix):]
    return f"{NEWS_RAW_BASE}/{path}"


def save_generated_image(
    *,
    prompt: str,
    output_path: Path,
    pollinations_token: str,
    label: str,
    index: int = 0,
) -> str | None:
    """Generate a local image file and return its eventual news-branch raw URL."""
    print(f"  Generating {label} image...")
    img_bytes, _ = generate_image(prompt, pollinations_token, index=index)
    if not img_bytes:
        print(f"  FATAL: {label} image generation failed")
        return None

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(img_bytes)

    print(f"  Saved {output_path.name} ({len(img_bytes)/1024:.0f} KB)")
    return news_raw_url(output_path.relative_to(REPO_ROOT).as_posix())


def get_week_window_from_publish_date(weekly_date: str) -> tuple[str, str, str]:
    """Return (week_start, week_end, publish_date) from a Sunday publish date."""
    publish_date = datetime.strptime(weekly_date, "%Y-%m-%d").date()
    if publish_date.weekday() != 6:
        raise ValueError(
            f"Weekly backfill expects a Sunday publish date, got {weekly_date}"
        )
    week_start = publish_date - timedelta(days=7)
    week_end = publish_date - timedelta(days=1)
    return (
        week_start.strftime("%Y-%m-%d"),
        week_end.strftime("%Y-%m-%d"),
        publish_date.strftime("%Y-%m-%d"),
    )


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
    if not ai_analysis:
        print("  FATAL: AI analysis failed")
        return None

    gist = build_full_gist(pr_data, ai_analysis)
    gist["gist"]["publish_tier"] = apply_publish_tier_rules(gist)
    errors = validate_gist(gist)
    if errors:
        print(f"  FATAL: Schema validation failed: {errors}")
        return None

    # Save gist JSON locally
    with open(gist_file, "w", encoding="utf-8") as f:
        json.dump(gist, f, indent=2, ensure_ascii=False)
    print(f"  Saved {gist_file.name}")

    image_prompt = gist.get("gist", {}).get("image_prompt", "")
    if not image_prompt:
        print("  FATAL: Gist is missing image_prompt")
        return None
    print(f"  Generating image...")
    image_url = save_generated_image(
        prompt=image_prompt,
        output_path=gist_dir / f"PR-{pr_number}.jpg",
        pollinations_token=pollinations_token,
        label="gist",
    )
    if not image_url:
        return None

    # Update gist with eventual news-branch image URL
    gist["image"] = {
        "url": image_url,
        "prompt": image_prompt,
    }
    with open(gist_file, "w", encoding="utf-8") as f:
        json.dump(gist, f, indent=2, ensure_ascii=False)

    tier = gist.get("gist", {}).get("publish_tier", "?")
    importance = gist.get("gist", {}).get("importance", "?")
    print(f"  Done: publish_tier={tier}, importance={importance}")
    return gist


def backfill_gists(
    date_str: str,
    github_token: str,
    pollinations_token: str,
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
            pr_num, date_str, github_token, pollinations_token
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
    if not twitter_post or not twitter_post.get("image_prompt"):
        print("  FATAL: Twitter post generation failed")
        return False
    tweet = twitter_post.get("tweet", "")
    print(f"  Tweet ({len(tweet)} chars): {tweet[:80]}...")

    print("\n  [3/4] Generating Instagram post...")
    instagram_post = generate_platform_post(
        "instagram", summary, pollinations_token,
        "Create a cozy pixel art post about these updates."
    )
    instagram_images = instagram_post.get("images", []) if instagram_post else []
    if not instagram_post or not instagram_images or any(not img.get("prompt") for img in instagram_images[:3]):
        print("  FATAL: Instagram post generation failed")
        return False
    img_count = len(instagram_images)
    print(f"  Instagram: {img_count} images")

    print("\n  [4/4] Generating Reddit post...")
    reddit_post = generate_platform_post(
        "reddit", summary, pollinations_token,
        "Create a Reddit post for today's update."
    )
    if not reddit_post or not reddit_post.get("image_prompt"):
        print("  FATAL: Reddit post generation failed")
        return False
    print(f"  Reddit: {reddit_post.get('title', '')[:80]}")

    # Save daily output
    daily_dir = REPO_ROOT / "social" / "news" / "daily" / date_str
    daily_dir.mkdir(parents=True, exist_ok=True)
    images_dir = daily_dir / "images"
    images_dir.mkdir(exist_ok=True)

    print("\n  Generating platform images...")

    # Twitter image
    if twitter_post and twitter_post.get("image_prompt"):
        image_url = save_generated_image(
            prompt=twitter_post["image_prompt"],
            output_path=images_dir / "twitter.jpg",
            pollinations_token=pollinations_token,
            label="Twitter",
        )
        if not image_url:
            return False
        twitter_post["image"] = {
            "url": image_url,
            "prompt": twitter_post["image_prompt"],
        }

    # Instagram images (carousel)
    if instagram_post and instagram_post.get("images"):
        for i, img_info in enumerate(instagram_post["images"][:3]):
            prompt = img_info.get("prompt", "")
            if not prompt:
                print(f"  FATAL: Instagram image {i+1} is missing prompt")
                return False
            image_url = save_generated_image(
                prompt=prompt,
                output_path=images_dir / f"instagram-{i+1}.jpg",
                pollinations_token=pollinations_token,
                label=f"Instagram {i+1}",
                index=i,
            )
            if not image_url:
                return False
            img_info["url"] = image_url
            time.sleep(3)

    # Reddit image
    if reddit_post and reddit_post.get("image_prompt"):
        image_url = save_generated_image(
            prompt=reddit_post["image_prompt"],
            output_path=images_dir / "reddit.jpg",
            pollinations_token=pollinations_token,
            label="Reddit",
        )
        if not image_url:
            return False
        reddit_post["image"] = {
            "url": image_url,
            "prompt": reddit_post["image_prompt"],
        }

    generated_at = datetime.now(timezone.utc).isoformat()
    summary_artifact = build_daily_summary_artifact(
        summary, daily_gists, date_str, generated_at
    )
    with open(daily_dir / "summary.json", "w", encoding="utf-8") as f:
        json.dump(summary_artifact, f, indent=2, ensure_ascii=False)
    print("  Saved summary.json")

    for platform, post in [("twitter", twitter_post), ("instagram", instagram_post), ("reddit", reddit_post)]:
        if post:
            normalized = normalize_platform_post(
                platform=platform,
                scope="daily",
                date=date_str,
                period_start=date_str,
                period_end=date_str,
                generated_at=generated_at,
                raw_post=post,
            )
            out_file = daily_dir / f"{platform}.json"
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(normalized, f, indent=2, ensure_ascii=False)
            print(f"  Saved {platform}.json")

    print(f"\n  Daily output saved to {daily_dir}")
    return True


# ── Tier 3: Weekly summary ─────────────────────────────────────────

def backfill_weekly(
    weekly_date: str,
    pollinations_token: str,
) -> bool:
    """Generate weekly summary + platform posts for a Sunday publish date."""
    try:
        week_start, week_end, publish_date = get_week_window_from_publish_date(
            weekly_date
        )
    except ValueError as exc:
        print(f"  Error: {exc}")
        return False

    print(f"\n{'='*60}")
    print(f"TIER 3: Generating weekly summary for {publish_date}")
    print(f"  Coverage: {week_start} to {week_end}")
    print(f"{'='*60}")

    all_gists = read_gists_for_week(week_start, week_end)
    daily_gists = filter_daily_gists(all_gists)
    print(f"  {len(all_gists)} total gists, {len(daily_gists)} with publish_tier=daily")

    if not daily_gists:
        print("  No daily-tier gists — skipping")
        return False

    print("\n  [1/4] Generating weekly summary...")
    digest = generate_digest(daily_gists, week_start, week_end, pollinations_token)
    if not digest:
        print("  Digest generation failed!")
        return False
    print(f"  Theme: {digest.get('theme', '')[:80]}")

    print("\n  [2/4] Generating weekly platform posts...")

    twitter_post = generate_weekly_twitter_post(digest, pollinations_token)
    if not twitter_post or not twitter_post.get("image_prompt"):
        print("  FATAL: Weekly Twitter post generation failed")
        return False

    linkedin_post = generate_linkedin_post(digest, pollinations_token)
    if not linkedin_post or not linkedin_post.get("image_prompt"):
        print("  FATAL: Weekly LinkedIn post generation failed")
        return False

    instagram_post = generate_weekly_instagram_post(digest, pollinations_token)
    instagram_images = instagram_post.get("images", []) if instagram_post else []
    if (
        not instagram_post
        or not instagram_images
        or any(not img.get("prompt") for img in instagram_images[:3])
    ):
        print("  FATAL: Weekly Instagram post generation failed")
        return False

    reddit_post = generate_weekly_reddit_post(digest, pollinations_token)
    if not reddit_post or not reddit_post.get("image_prompt"):
        print("  FATAL: Weekly Reddit post generation failed")
        return False

    discord_post = generate_discord_post(digest, pollinations_token, publish_date)
    if (
        not discord_post
        or not discord_post.get("message")
        or not discord_post.get("image_prompt")
    ):
        print("  FATAL: Weekly Discord post generation failed")
        return False

    weekly_dir = REPO_ROOT / "social" / "news" / "weekly" / publish_date
    weekly_dir.mkdir(parents=True, exist_ok=True)
    images_dir = weekly_dir / "images"
    images_dir.mkdir(exist_ok=True)

    print("\n  [3/4] Generating weekly images...")

    image_url = save_generated_image(
        prompt=twitter_post["image_prompt"],
        output_path=images_dir / "twitter.jpg",
        pollinations_token=pollinations_token,
        label="Weekly Twitter",
    )
    if not image_url:
        return False
    twitter_post["image"] = {"url": image_url, "prompt": twitter_post["image_prompt"]}

    image_url = save_generated_image(
        prompt=linkedin_post["image_prompt"],
        output_path=images_dir / "linkedin.jpg",
        pollinations_token=pollinations_token,
        label="Weekly LinkedIn",
    )
    if not image_url:
        return False
    linkedin_post["image"] = {"url": image_url, "prompt": linkedin_post["image_prompt"]}

    for i, img_info in enumerate(instagram_post["images"][:3]):
        image_url = save_generated_image(
            prompt=img_info["prompt"],
            output_path=images_dir / f"instagram-{i+1}.jpg",
            pollinations_token=pollinations_token,
            label=f"Weekly Instagram {i+1}",
            index=i,
        )
        if not image_url:
            return False
        img_info["url"] = image_url
        time.sleep(3)

    image_url = save_generated_image(
        prompt=reddit_post["image_prompt"],
        output_path=images_dir / "reddit.jpg",
        pollinations_token=pollinations_token,
        label="Weekly Reddit",
    )
    if not image_url:
        return False
    reddit_post["image"] = {"url": image_url, "prompt": reddit_post["image_prompt"]}

    image_url = save_generated_image(
        prompt=discord_post["image_prompt"],
        output_path=images_dir / "discord.jpg",
        pollinations_token=pollinations_token,
        label="Weekly Discord",
    )
    if not image_url:
        return False
    discord_post["image"] = {"url": image_url, "prompt": discord_post["image_prompt"]}

    print("\n  [4/4] Saving weekly output...")
    generated_at = datetime.now(timezone.utc).isoformat()
    summary_artifact = build_weekly_summary_artifact(
        digest, daily_gists, publish_date, week_start, week_end, generated_at
    )
    with open(weekly_dir / "summary.json", "w", encoding="utf-8") as f:
        json.dump(summary_artifact, f, indent=2, ensure_ascii=False)
    print("  Saved summary.json")

    for platform, post in [
        ("twitter", twitter_post),
        ("linkedin", linkedin_post),
        ("instagram", instagram_post),
        ("reddit", reddit_post),
        ("discord", discord_post),
    ]:
        normalized = normalize_platform_post(
            platform=platform,
            scope="weekly",
            date=publish_date,
            period_start=week_start,
            period_end=week_end,
            generated_at=generated_at,
            raw_post=post,
        )
        out_file = weekly_dir / f"{platform}.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(normalized, f, indent=2, ensure_ascii=False)
        print(f"  Saved {platform}.json")

    print(f"\n  Weekly output saved to {weekly_dir}")
    return True


# ── Main ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Backfill missing gists, daily summaries, and weekly summaries"
    )
    parser.add_argument(
        "--dates", nargs="+", default=["2026-02-12", "2026-02-13"],
        help="Dates to backfill gists for (YYYY-MM-DD)"
    )
    parser.add_argument(
        "--daily", nargs="*", default=["2026-02-12"],
        help="Dates to generate daily summaries for (default: 2026-02-12)"
    )
    parser.add_argument(
        "--weekly", nargs="*", default=[],
        help="Sunday publish dates to generate weekly summaries for (YYYY-MM-DD)"
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
    print(f"  Weekly: {', '.join(args.weekly) if args.weekly else 'none'}")
    print("=" * 60)

    t0 = time.time()
    results = {}

    # Tier 1: Generate gists for all dates
    for date_str in args.dates:
        ts = time.time()
        gists = backfill_gists(date_str, github_token, pollinations_token)
        elapsed = time.time() - ts
        results[f"gists-{date_str}"] = (len(gists), f"{elapsed:.1f}s")

    # Tier 2: Generate daily summaries
    for date_str in (args.daily or []):
        ts = time.time()
        ok = backfill_daily(date_str, pollinations_token)
        elapsed = time.time() - ts
        results[f"daily-{date_str}"] = ("OK" if ok else "FAIL", f"{elapsed:.1f}s")

    # Tier 3: Generate weekly summaries
    for weekly_date in (args.weekly or []):
        ts = time.time()
        ok = backfill_weekly(weekly_date, pollinations_token)
        elapsed = time.time() - ts
        results[f"weekly-{weekly_date}"] = ("OK" if ok else "FAIL", f"{elapsed:.1f}s")

    total = time.time() - t0

    print(f"\n{'='*60}")
    print("RESULTS")
    print("=" * 60)
    for label, (status, elapsed) in results.items():
        print(f"  {label:30s} {str(status):6s} ({elapsed})")
    print(f"\n  Total: {total:.1f}s")


if __name__ == "__main__":
    main()
