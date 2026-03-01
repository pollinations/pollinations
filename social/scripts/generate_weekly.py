#!/usr/bin/env python3
"""
Tier 3: Weekly Digest Generator

Sunday 06:00 UTC:
  1. Read gists for the past 7 days (Sun→Sat)
  2. AI synthesizes weekly themes
  3. Generate platform posts (Twitter, LinkedIn, Instagram, Reddit, Discord)
  4. Generate 7 platform images (1 twitter + 1 linkedin + 3 instagram + 1 reddit + 1 discord)
  5. Commit all content directly to the news branch

Buffer staging happens immediately after in NEWS_summary.yml.
Direct channels (Reddit, Discord) publish via NEWS_publish.yml cron.

See social/PIPELINE.md for full architecture.
"""

import sys
import json
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from collections import defaultdict

from common import (
    load_prompt,
    load_format,
    get_env,
    call_pollinations_api,
    generate_image,
    generate_platform_post,
    commit_image_to_branch,
    read_gists_for_date,
    filter_daily_gists,
    parse_json_response,
    commit_files_to_branch,
    GISTS_BRANCH,
    IMAGE_SIZE,
)

# ── Constants ────────────────────────────────────────────────────────

WEEKLY_REL_DIR = "social/news/weekly"

def _weekly_image_context() -> str:
    """Load weekly image identity from weekly.md (everything after '## Weekly Image Identity')."""
    content = load_prompt("weekly")
    marker = "## Weekly Image Identity"
    idx = content.find(marker)
    return "\n\n" + content[idx:] if idx != -1 else ""


# ── Helpers ──────────────────────────────────────────────────────────

def get_week_range(override_start: Optional[str] = None):
    """Return (week_start, week_end) as YYYY-MM-DD strings.
    Covers a 7-day window: start through start+6.
    When run by cron on Sunday 06:00 UTC, start = today-7 (last Sunday)
    and end = today-1 (Saturday). NOTE: only correct when run on Sunday."""
    if override_start:
        start = datetime.strptime(override_start, "%Y-%m-%d").date()
    else:
        today = datetime.now(timezone.utc).date()
        start = today - timedelta(days=7)

    end = start + timedelta(days=6)  # Saturday
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


def read_gists_for_week(week_start: str, week_end: str) -> List[Dict]:
    """Read all gist JSON files for each day in the week range.
    Reads directly from local repo gists (no daily summary dependency)."""
    all_gists = []

    start = datetime.strptime(week_start, "%Y-%m-%d")
    end = datetime.strptime(week_end, "%Y-%m-%d")
    current = start

    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        day_gists = read_gists_for_date(date_str)
        if day_gists:
            print(f"    {date_str}: {len(day_gists)} gists")
        all_gists.extend(day_gists)
        current += timedelta(days=1)

    return all_gists


# ── Step 1: Generate weekly summary ─────────────────────────────────

def generate_digest(gists: List[Dict], week_start: str, week_end: str,
                    token: str) -> Optional[Dict]:
    """Synthesize PR gists into weekly summary."""
    system_prompt = load_prompt("weekly")

    # Build context from gists, grouped by date
    by_date = defaultdict(list)
    for g in gists:
        date = g.get("merged_at", "")[:10] or "unknown"
        ai = g.get("gist", {})
        by_date[date].append({
            "pr_number": g.get("pr_number"),
            "title": g.get("title"),
            "author": g.get("author"),
            "category": ai.get("category"),
            "importance": ai.get("importance"),
            "summary": ai.get("summary"),
            "impact": ai.get("impact"),
            "keywords": ai.get("keywords"),
        })

    gist_context = []
    for date in sorted(by_date.keys()):
        gist_context.append(json.dumps({
            "date": date,
            "pr_count": len(by_date[date]),
            "prs": by_date[date],
        }, indent=2))

    user_prompt = f"""Week: {week_start} to {week_end}
Total PRs: {len(gists)}
Days with PRs: {len(by_date)}

PR gists by date:
{chr(10).join(gist_context)}"""

    response = call_pollinations_api(
        system_prompt, user_prompt, token,
        temperature=0.3, exit_on_failure=False
    )
    if not response:
        return None
    return parse_json_response(response)


# ── Step 2: Generate platform posts ─────────────────────────────────

def generate_twitter_post(digest: Dict, token: str) -> Optional[Dict]:
    return generate_platform_post("twitter", digest, token,
        "Write a tweet about this week's shipped work.",
        temperature=0.8, extra_context=_weekly_image_context())

def generate_linkedin_post(digest: Dict, token: str) -> Optional[Dict]:
    return generate_platform_post("linkedin", digest, token,
        "Create a LinkedIn post about this week's development work.",
        extra_context=_weekly_image_context())

def generate_instagram_post(digest: Dict, token: str) -> Optional[Dict]:
    return generate_platform_post("instagram", digest, token,
        "Create a cozy pixel art post about this week's updates.",
        extra_context=_weekly_image_context())

def generate_reddit_post(digest: Dict, token: str) -> Optional[Dict]:
    return generate_platform_post("reddit", digest, token,
        "Create a Reddit post for this week's update.",
        extra_context=_weekly_image_context())


def generate_discord_post(digest: Dict, token: str, week_end: str) -> Optional[Dict]:
    """Generate weekly discord.json (special: uses date_str substitution in format)."""
    voice = load_prompt("tone/discord")
    pr_summary = digest.get("pr_summary", "")
    arc_titles = str([a["headline"] for a in digest.get("arcs", [])])
    pr_count = digest.get("pr_count", 0)

    fmt = load_format("discord").replace("{date_str}", week_end)
    task = f"Write a Discord message about the latest updates.\n\n{pr_summary}\n\nMost impactful updates: {arc_titles}"
    if pr_count:
        task += f"\nTotal PRs merged: {pr_count}"
    task += "\n\n" + fmt + _weekly_image_context()

    response = call_pollinations_api(voice, task, token, temperature=0.7, exit_on_failure=False)
    if not response:
        return None

    text = response.strip()
    result = parse_json_response(text)
    if result:
        result["date"] = week_end
    return result


# ── Step 3: Generate images ────────────────────────────────────────

def generate_platform_images(
    twitter_post: Optional[Dict],
    linkedin_post: Optional[Dict],
    instagram_post: Optional[Dict],
    week_end: str,
    token: str,
    github_token: str,
    owner: str,
    repo: str,
    branch: str,
    reddit_post: Optional[Dict] = None,
    discord_post: Optional[Dict] = None,
) -> None:
    """Generate images for all platforms and commit to branch."""
    image_dir = f"{WEEKLY_REL_DIR}/{week_end}/images"

    # Twitter: 1 image
    if twitter_post and twitter_post.get("image_prompt"):
        print("  Generating Twitter image...")
        img_bytes, _ = generate_image(twitter_post["image_prompt"], token, IMAGE_SIZE, IMAGE_SIZE)
        if img_bytes:
            url = commit_image_to_branch(
                img_bytes, f"{image_dir}/twitter.jpg", branch,
                github_token, owner, repo
            )
            if url:
                twitter_post["image"] = {"url": url, "prompt": twitter_post["image_prompt"]}

    # LinkedIn: 1 image
    if linkedin_post and linkedin_post.get("image_prompt"):
        print("  Generating LinkedIn image...")
        img_bytes, _ = generate_image(linkedin_post["image_prompt"], token, IMAGE_SIZE, IMAGE_SIZE)
        if img_bytes:
            url = commit_image_to_branch(
                img_bytes, f"{image_dir}/linkedin.jpg", branch,
                github_token, owner, repo
            )
            if url:
                linkedin_post["image"] = {"url": url, "prompt": linkedin_post["image_prompt"]}

    # Instagram: up to 3 images (carousel)
    if instagram_post and instagram_post.get("images"):
        for i, img_info in enumerate(instagram_post["images"][:3]):
            prompt = img_info.get("prompt", "")
            if not prompt:
                continue
            print(f"  Generating Instagram image {i+1}...")
            img_bytes, _ = generate_image(prompt, token, IMAGE_SIZE, IMAGE_SIZE, i)
            if img_bytes:
                url = commit_image_to_branch(
                    img_bytes, f"{image_dir}/instagram-{i+1}.jpg", branch,
                    github_token, owner, repo
                )
                if url:
                    img_info["url"] = url
            time.sleep(3)

    # Reddit: 1 image
    if reddit_post and reddit_post.get("image_prompt"):
        print("  Generating Reddit image...")
        img_bytes, _ = generate_image(reddit_post["image_prompt"], token, IMAGE_SIZE, IMAGE_SIZE)
        if img_bytes:
            url = commit_image_to_branch(
                img_bytes, f"{image_dir}/reddit.jpg", branch,
                github_token, owner, repo
            )
            if url:
                reddit_post["image"] = {"url": url, "prompt": reddit_post["image_prompt"]}

    # Discord: 1 image
    if discord_post and discord_post.get("image_prompt"):
        print("  Generating Discord image...")
        img_bytes, _ = generate_image(discord_post["image_prompt"], token, IMAGE_SIZE, IMAGE_SIZE)
        if img_bytes:
            url = commit_image_to_branch(
                img_bytes, f"{image_dir}/discord.jpg", branch,
                github_token, owner, repo
            )
            if url:
                discord_post["image"] = {"url": url, "prompt": discord_post["image_prompt"]}


# ── Step 4: Commit to news branch ─────────────────────────────────

def commit_weekly_to_news(
    week_end: str,
    twitter_post: Optional[Dict],
    linkedin_post: Optional[Dict],
    instagram_post: Optional[Dict],
    discord_post: Optional[Dict],
    github_token: str,
    owner: str,
    repo: str,
    reddit_post: Optional[Dict] = None,
) -> bool:
    """Commit all weekly content directly to the news branch. Returns True on success."""
    base_path = f"{WEEKLY_REL_DIR}/{week_end}"
    pollinations_token = get_env("POLLINATIONS_TOKEN")

    # Generate images (commits them directly to news branch)
    print("\n  Generating platform images...")
    generate_platform_images(
        twitter_post, linkedin_post, instagram_post,
        week_end, pollinations_token,
        github_token, owner, repo, GISTS_BRANCH,
        reddit_post=reddit_post,
        discord_post=discord_post,
    )

    # Add platform metadata and collect files
    files_to_commit = []
    now_iso = datetime.now(timezone.utc).isoformat()
    for platform, post, filename in [
        ("twitter", twitter_post, "twitter.json"),
        ("linkedin", linkedin_post, "linkedin.json"),
        ("instagram", instagram_post, "instagram.json"),
        ("reddit", reddit_post, "reddit.json"),
        ("discord", discord_post, "discord.json"),
    ]:
        if not post:
            continue
        post["date"] = week_end
        post["generated_at"] = now_iso
        post["platform"] = platform
        if platform == "linkedin":
            full = post.get("hook", "") + "\n\n" + post.get("body", "")
            if post.get("cta"):
                full += "\n\n" + post["cta"]
            if post.get("hashtags"):
                full += "\n\n" + " ".join(post["hashtags"][:5])
            post["full_post"] = full
        if platform == "instagram":
            post["post_type"] = "carousel" if len(post.get("images", [])) > 1 else "single"
        files_to_commit.append((f"{base_path}/{filename}", post))

    if not files_to_commit:
        print("  No files to commit")
        return False

    commit_files_to_branch(files_to_commit, GISTS_BRANCH, github_token, owner, repo, label=f"for week of {week_end}")
    print(f"  Committed {len(files_to_commit)} files to {GISTS_BRANCH} branch")
    return True


# ── Main ─────────────────────────────────────────────────────────────

def main():
    print("=== Tier 3: Weekly Digest Generator ===")

    github_token = get_env("GITHUB_TOKEN")
    pollinations_token = get_env("POLLINATIONS_TOKEN")
    repo_full = get_env("GITHUB_REPOSITORY")
    week_start_override = get_env("WEEK_START_DATE", required=False)

    owner, repo = repo_full.split("/")
    week_start, week_end = get_week_range(week_start_override)
    print(f"  Week: {week_start} to {week_end}")

    # ── Read gists ─────────────────────────────────────────────────────
    print(f"\n[1/4] Reading gists for {week_start} to {week_end}...")
    all_gists = read_gists_for_week(week_start, week_end)
    daily_gists = filter_daily_gists(all_gists)
    print(f"  Found {len(all_gists)} total gists, {len(daily_gists)} with publish_tier=daily")

    if not daily_gists:
        print("  No daily-tier gists found. Skipping.")
        print("=== Done (no content) ===")
        return

    # ── Generate summary ─────────────────────────────────────────────
    print(f"\n[2/4] Generating weekly summary...")
    digest = generate_digest(daily_gists, week_start, week_end, pollinations_token)
    if not digest:
        print("  Digest generation failed!")
        sys.exit(1)
    print(f"  Theme: {digest.get('theme', '')}")
    print(f"  {len(digest.get('arcs', []))} arcs, {digest.get('pr_count', 0)} PRs")

    # ── Generate platform posts ──────────────────────────────────────
    print(f"\n[3/4] Generating platform posts...")

    print("  Twitter...")
    twitter_post = generate_twitter_post(digest, pollinations_token)

    print("  LinkedIn...")
    linkedin_post = generate_linkedin_post(digest, pollinations_token)

    print("  Instagram...")
    instagram_post = generate_instagram_post(digest, pollinations_token)

    print("  Reddit...")
    reddit_post = generate_reddit_post(digest, pollinations_token)

    print("  Discord...")
    discord_post = generate_discord_post(digest, pollinations_token, week_end)

    # ── Commit to news branch ────────────────────────────────────────
    print(f"\n[4/4] Committing weekly content to news branch...")
    success = commit_weekly_to_news(
        week_end,
        twitter_post, linkedin_post, instagram_post, discord_post,
        github_token, owner, repo,
        reddit_post=reddit_post,
    )

    if success:
        print("\n=== Done! ===")
    else:
        print("\n=== Failed to commit weekly content ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
