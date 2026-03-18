#!/usr/bin/env python3
"""
Tier 2: Daily Summary Generator

At 06:00 UTC daily:
  1. Read gists for yesterday (by merged_at date)
  2. Filter to publish_tier >= "daily"
  3. AI clusters gists into 3-5 narrative arcs
  4. Generate platform posts using existing prompts: twitter.json, instagram.json, reddit.json
  5. Generate platform images (1 twitter + 3 instagram + 1 reddit)
  Note: LinkedIn is weekly-only — no daily LinkedIn posts.
  6. Generate highlights from gists
  7. Commit all content (posts, images, highlights) to the news branch

See social/PIPELINE.md for full architecture.
"""

import os
import sys
import json
import time
import base64
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from common import (
    load_prompt,
    get_env,
    get_repo_root,
    call_pollinations_api,
    generate_image,
    generate_platform_post,
    commit_image_to_branch,
    read_gists_for_date,
    read_news_text_file,
    filter_daily_gists,
    parse_json_response,
    github_api_request,
    commit_files_to_branch,
    GITHUB_API_BASE,
    GISTS_BRANCH,
    IMAGE_SIZE,
    OWNER,
    REPO,
)

# ── Constants ────────────────────────────────────────────────────────

DAILY_REL_DIR = "social/news/daily"
HIGHLIGHTS_PATH = "social/news/highlights.md"


# ── Highlights ────────────────────────────────────────────────────────

def load_gists_as_changelog(date_str: str) -> tuple[str, int]:
    """Read gists for a date and format as a changelog for the highlights prompt.

    Filters to user-facing, publishable gists only.
    Returns (changelog_text, gist_count).
    """
    gists = read_gists_for_date(date_str)

    filtered = [
        g for g in gists
        if g.get("gist", {}).get("publish_tier") != "none"
        and g.get("gist", {}).get("user_facing", False)
    ]

    if not filtered:
        return "", 0

    lines = [f"# Updates for {date_str}\n"]
    for g in filtered:
        ai = g.get("gist", {})
        lines.append(f"## PR #{g['pr_number']}: {g['title']}")
        if ai.get("summary"):
            lines.append(f"**Summary:** {ai['summary']}")
        if ai.get("impact"):
            lines.append(f"**Impact:** {ai['impact']}")
        if ai.get("headline"):
            lines.append(f"**Headline:** {ai['headline']}")
        if ai.get("keywords"):
            lines.append(f"**Keywords:** {', '.join(ai['keywords'])}")
        lines.append("")

    return "\n".join(lines), len(filtered)


def create_highlights_prompt(news_content: str, news_date: str) -> tuple:
    """Create prompt to extract only the most significant highlights."""
    template = load_prompt("highlights")
    system_prompt = (template.replace("{news_date}", news_date)
                     .replace("{news_content}", news_content))

    return system_prompt, "Generate the highlights now."


def parse_highlights_response(response: str) -> str:
    """Clean up AI response, removing code blocks if present"""
    message = response.strip()

    if message.startswith('```'):
        lines = message.split('\n')
        if lines[0].strip() == '```' or lines[0].startswith('```'):
            lines = lines[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        message = '\n'.join(lines)

    return message.strip()


def merge_highlights(new_highlights: str, existing_highlights: str) -> str:
    """Prepend new highlights to existing ones"""
    new_clean = new_highlights.strip()
    existing_clean = existing_highlights.strip()

    if not existing_clean:
        return new_clean + "\n"

    return new_clean + "\n" + existing_clean + "\n"


def generate_highlights(pollinations_token: str, date_str: str) -> str | None:
    """Generate updated highlights.md content without creating a PR.

    Reads gists for the given date, AI-curates highlights, merges with existing
    highlights.md.

    Returns merged highlights content, or None if no updates.
    """
    changelog, gist_count = load_gists_as_changelog(date_str)
    if not changelog:
        print(f"  Highlights: no qualifying gists for {date_str}")
        return None
    print(f"  Highlights: {gist_count} qualifying gists for {date_str}")

    system_prompt, user_prompt = create_highlights_prompt(changelog, date_str)
    ai_response = call_pollinations_api(
        system_prompt, user_prompt, pollinations_token,
        temperature=0.3, exit_on_failure=False,
    )
    if not ai_response:
        print("  FATAL: Highlights AI generation failed")
        sys.exit(1)

    new_highlights = parse_highlights_response(ai_response)
    if not new_highlights.strip():
        print("  FATAL: Highlights AI returned empty content")
        sys.exit(1)

    print(f"  Highlights: generated new entries")

    repo_root = get_repo_root()
    highlights_path = os.path.join(repo_root, HIGHLIGHTS_PATH)
    existing_highlights = ""
    if os.path.exists(highlights_path):
        with open(highlights_path, "r") as f:
            existing_highlights = f.read()
    else:
        github_token = get_env("GITHUB_TOKEN", required=False)
        if github_token:
            fetched = read_news_text_file(HIGHLIGHTS_PATH, github_token, OWNER, REPO)
            if fetched:
                existing_highlights = fetched
                print("  Highlights: fetched existing from news branch via API")
    merged_highlights = merge_highlights(new_highlights, existing_highlights)

    return merged_highlights


# ── Helpers ──────────────────────────────────────────────────────────

def get_target_date(override: Optional[str] = None) -> str:
    """Get the target date (YYYY-MM-DD). Defaults to yesterday UTC."""
    if override:
        return override
    yesterday = datetime.now(timezone.utc) - timedelta(days=1)
    return yesterday.strftime("%Y-%m-%d")


# ── Step 1: Generate daily summary ──────────────────────────────────

def generate_summary(gists: List[Dict], date_str: str, token: str) -> Optional[Dict]:
    """Cluster gists into narrative arcs and produce summary.json."""
    system_prompt = load_prompt("daily")

    # Build gist context for AI
    gist_lines = []
    for g in gists:
        ai = g.get("gist", {})
        gist_lines.append(json.dumps({
            "pr_number": g["pr_number"],
            "title": g["title"],
            "author": g["author"],
            "category": ai.get("category"),
            "importance": ai.get("importance"),
            "user_facing": ai.get("user_facing"),
            "summary": ai.get("summary"),
            "impact": ai.get("impact"),
            "keywords": ai.get("keywords"),
        }, indent=2))

    user_prompt = f"""Date: {date_str}
Number of PRs: {len(gists)}

PR Gists:
{chr(10).join(gist_lines)}"""

    response = call_pollinations_api(
        system_prompt, user_prompt, token,
        temperature=0.3, exit_on_failure=False
    )

    if not response:
        return None
    return parse_json_response(response)


# ── Step 2: Generate platform posts ─────────────────────────────────

def generate_twitter_post(summary: Dict, token: str) -> Optional[Dict]:
    return generate_platform_post("twitter", summary, token,
        "Write a tweet about today's shipped work.", temperature=0.8)

def generate_instagram_post(summary: Dict, token: str) -> Optional[Dict]:
    return generate_platform_post("instagram", summary, token,
        "Create a cozy pixel art post about these updates.")

def generate_reddit_post(summary: Dict, token: str) -> Optional[Dict]:
    return generate_platform_post("reddit", summary, token,
        "Create a Reddit post for today's update.")


# ── Step 3: Generate platform images ────────────────────────────────

def generate_platform_images(
    twitter_post: Optional[Dict],
    instagram_post: Optional[Dict],
    date_str: str,
    token: str,
    github_token: str,
    owner: str,
    repo: str,
    branch: str,
    reddit_post: Optional[Dict] = None,
) -> Dict[str, List[str]]:
    """Generate images for all platforms. Returns {platform: [urls]}.
    Note: LinkedIn is weekly-only, no daily image generation."""
    image_dir = f"{DAILY_REL_DIR}/{date_str}/images"
    urls = {"twitter": [], "instagram": [], "reddit": []}

    # Twitter: 1 image
    if twitter_post and twitter_post.get("image_prompt"):
        print("  Generating Twitter image...")
        img_bytes, _ = generate_image(twitter_post["image_prompt"], token, IMAGE_SIZE, IMAGE_SIZE)
        if not img_bytes:
            print("  FATAL: Daily Twitter image generation failed")
            sys.exit(1)
        url = commit_image_to_branch(
            img_bytes, f"{image_dir}/twitter.jpg", branch,
            github_token, owner, repo
        )
        if not url:
            print("  FATAL: Daily Twitter image commit failed")
            sys.exit(1)
        urls["twitter"].append(url)
        twitter_post["image"] = {"url": url, "prompt": twitter_post["image_prompt"]}

    # Instagram: up to 3 images (carousel)
    if instagram_post and instagram_post.get("images"):
        for i, img_info in enumerate(instagram_post["images"][:3]):
            prompt = img_info.get("prompt", "")
            if not prompt:
                print(f"  FATAL: Daily Instagram image {i+1} is missing a prompt")
                sys.exit(1)
            print(f"  Generating Instagram image {i+1}...")
            img_bytes, _ = generate_image(prompt, token, IMAGE_SIZE, IMAGE_SIZE, i)
            if not img_bytes:
                print(f"  FATAL: Daily Instagram image {i+1} generation failed")
                sys.exit(1)
            url = commit_image_to_branch(
                img_bytes, f"{image_dir}/instagram-{i+1}.jpg", branch,
                github_token, owner, repo
            )
            if not url:
                print(f"  FATAL: Daily Instagram image {i+1} commit failed")
                sys.exit(1)
            urls["instagram"].append(url)
            img_info["url"] = url
            time.sleep(3)  # Rate limiting

    # Reddit: 1 image
    if reddit_post and reddit_post.get("image_prompt"):
        print("  Generating Reddit image...")
        img_bytes, _ = generate_image(reddit_post["image_prompt"], token, IMAGE_SIZE, IMAGE_SIZE)
        if not img_bytes:
            print("  FATAL: Daily Reddit image generation failed")
            sys.exit(1)
        url = commit_image_to_branch(
            img_bytes, f"{image_dir}/reddit.jpg", branch,
            github_token, owner, repo
        )
        if not url:
            print("  FATAL: Daily Reddit image commit failed")
            sys.exit(1)
        urls["reddit"].append(url)
        reddit_post["image"] = {"url": url, "prompt": reddit_post["image_prompt"]}

    return urls


# ── Step 4: Commit to news branch ─────────────────────────────────

def commit_daily_to_news(
    date_str: str,
    twitter_post: Optional[Dict],
    instagram_post: Optional[Dict],
    github_token: str,
    owner: str,
    repo: str,
    reddit_post: Optional[Dict] = None,
    highlights_content: Optional[str] = None,
) -> bool:
    """Commit all daily content directly to the news branch. Returns True on success."""
    base_path = f"{DAILY_REL_DIR}/{date_str}"
    now_iso = datetime.now(timezone.utc).isoformat()

    # Generate images (commits them directly to news branch)
    print("\n  Generating platform images...")
    generate_platform_images(
        twitter_post, instagram_post,
        date_str, get_env("POLLINATIONS_TOKEN"),
        github_token, owner, repo, GISTS_BRANCH,
        reddit_post=reddit_post,
    )

    # Collect files to commit
    files_to_commit = []
    if twitter_post:
        twitter_post.update({"date": date_str, "generated_at": now_iso, "platform": "twitter"})
        files_to_commit.append((f"{base_path}/twitter.json", twitter_post))
    if instagram_post:
        instagram_post.update({
            "date": date_str, "generated_at": now_iso, "platform": "instagram",
            "post_type": "carousel" if len(instagram_post.get("images", [])) > 1 else "post",
        })
        files_to_commit.append((f"{base_path}/instagram.json", instagram_post))
    if reddit_post:
        reddit_post.update({"date": date_str, "generated_at": now_iso, "platform": "reddit"})
        files_to_commit.append((f"{base_path}/reddit.json", reddit_post))
    if highlights_content:
        files_to_commit.append(("social/news/highlights.md", highlights_content))

    if not files_to_commit:
        print("  No files to commit")
        return False

    commit_files_to_branch(files_to_commit, GISTS_BRANCH, github_token, owner, repo, label=f"for {date_str}")
    print(f"  Committed {len(files_to_commit)} files to {GISTS_BRANCH} branch")
    return True


# ── Main ─────────────────────────────────────────────────────────────

def main():
    print("=== Tier 2: Daily Summary Generator ===")

    # Environment
    github_token = get_env("GITHUB_TOKEN")
    pollinations_token = get_env("POLLINATIONS_TOKEN")
    repo_full_name = get_env("GITHUB_REPOSITORY")
    date_override = get_env("TARGET_DATE", required=False)

    owner, repo = repo_full_name.split("/")
    date_str = get_target_date(date_override)
    print(f"  Target date: {date_str}")

    # ── Read gists ───────────────────────────────────────────────────
    print(f"\n[1/5] Reading gists for {date_str}...")

    # Try local repo first, fall back to GitHub API
    gists = read_gists_for_date(date_str)

    if not gists:
        # Fallback: try fetching from GitHub API (gists might not be checked out)
        print("  No local gists found, fetching from GitHub API...")
        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {github_token}",
        }
        gists_dir = f"social/news/gists/{date_str}"
        resp = github_api_request(
            "GET",
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{gists_dir}?ref={GISTS_BRANCH}",
            headers=headers,
        )
        if resp.status_code == 200:
            for file_info in resp.json():
                if file_info["name"].startswith("PR-") and file_info["name"].endswith(".json"):
                    content_resp = github_api_request("GET", file_info["url"], headers=headers)
                    if content_resp.status_code == 200:
                        content = base64.b64decode(content_resp.json()["content"]).decode()
                        try:
                            gists.append(json.loads(content))
                        except json.JSONDecodeError:
                            pass

    if not gists:
        print(f"  No gists found for {date_str}. No PRs merged — skipping.")
        print("=== Done (no content) ===")
        return

    # Filter to daily-tier gists
    daily_gists = filter_daily_gists(gists)
    print(f"  Found {len(gists)} total gists, {len(daily_gists)} with publish_tier=daily")

    if not daily_gists:
        print("  No daily-tier gists. Skipping.")
        print("=== Done (no daily content) ===")
        return

    # ── Generate summary ─────────────────────────────────────────────
    print(f"\n[2/5] Generating daily summary...")
    summary = generate_summary(daily_gists, date_str, pollinations_token)
    if not summary:
        print("  Summary generation failed!")
        sys.exit(1)
    print(f"  {len(summary.get('arcs', []))} arcs: {summary.get('one_liner', '')}")

    # ── Generate platform posts ──────────────────────────────────────
    print(f"\n[3/5] Generating platform posts...")

    print("  Twitter...")
    twitter_post = generate_twitter_post(summary, pollinations_token)
    if not twitter_post:
        print("  FATAL: Daily Twitter post generation failed")
        sys.exit(1)
    if not twitter_post.get("image_prompt"):
        print("  FATAL: Daily Twitter post is missing image_prompt")
        sys.exit(1)
    tweet = twitter_post.get("tweet", "")
    print(f"  Twitter: {tweet[:80]}... ({len(tweet)} chars)")

    print("  Instagram...")
    instagram_post = generate_instagram_post(summary, pollinations_token)
    if not instagram_post:
        print("  FATAL: Daily Instagram post generation failed")
        sys.exit(1)
    instagram_images = instagram_post.get("images", [])
    if not instagram_images:
        print("  FATAL: Daily Instagram post is missing images")
        sys.exit(1)
    if any(not img.get("prompt") for img in instagram_images[:3]):
        print("  FATAL: Daily Instagram post has an image without a prompt")
        sys.exit(1)
    img_count = len(instagram_images)
    print(f"  Instagram: {img_count} images")

    print("  Reddit...")
    reddit_post = generate_reddit_post(summary, pollinations_token)
    if not reddit_post:
        print("  FATAL: Daily Reddit post generation failed")
        sys.exit(1)
    if not reddit_post.get("image_prompt"):
        print("  FATAL: Daily Reddit post is missing image_prompt")
        sys.exit(1)
    print(f"  Reddit: {reddit_post.get('title', '')[:80]}")

    # ── Generate highlights ──────────────────────────────────────────
    print(f"\n[4/5] Generating highlights...")
    highlights_content = generate_highlights(pollinations_token, date_str)

    # ── Commit daily content to news branch ──────────────────────────
    print(f"\n[5/5] Committing daily content to news branch...")
    success = commit_daily_to_news(
        date_str,
        twitter_post, instagram_post,
        github_token, owner, repo,
        reddit_post=reddit_post,
        highlights_content=highlights_content,
    )

    if not success:
        print("\n=== Failed to commit daily content ===")
        sys.exit(1)

    print("\n=== Done! ===")


if __name__ == "__main__":
    main()
