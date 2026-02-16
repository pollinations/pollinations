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
  6. Commit all content to the news branch
  7. Create a small README-only PR to main

See social/PIPELINE.md for full architecture.
"""

import sys
import json
import time
import base64
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from common import (
    load_prompt,
    get_env,
    call_pollinations_api,
    generate_image,
    generate_platform_post,
    commit_image_to_branch,
    read_gists_for_date,
    filter_daily_gists,
    parse_json_response,
    github_api_request,
    create_branch_from_main,
    commit_files_to_branch,
    create_or_update_pr,
    GITHUB_API_BASE,
    GISTS_BRANCH,
    IMAGE_SIZE,
)
from update_highlights import generate_highlights_and_readme

# ── Constants ────────────────────────────────────────────────────────

DAILY_REL_DIR = "social/news/daily"


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
        if img_bytes:
            url = commit_image_to_branch(
                img_bytes, f"{image_dir}/twitter.jpg", branch,
                github_token, owner, repo
            )
            if url:
                urls["twitter"].append(url)
                twitter_post["image"] = {"url": url, "prompt": twitter_post["image_prompt"]}

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
                    urls["instagram"].append(url)
                    img_info["url"] = url
            time.sleep(3)  # Rate limiting

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
            "post_type": "carousel" if len(instagram_post.get("images", [])) > 1 else "single",
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


# ── Step 5: README-only PR to main ────────────────────────────────

def create_readme_pr(
    date_str: str,
    readme_content: str,
    github_token: str,
    owner: str,
    repo: str,
) -> Optional[int]:
    """Create a small PR to main containing only the README update."""
    branch = f"readme-news-{date_str}"

    if create_branch_from_main(branch, github_token, owner, repo) is None:
        return None

    commit_files_to_branch(
        [("README.md", readme_content)],
        branch, github_token, owner, repo,
        label=f"for {date_str}",
    )

    pr_body = f"Update README Latest News section for {date_str}.\n\nGenerated automatically by GitHub Actions."

    return create_or_update_pr(
        f"Update README news — {date_str}", pr_body, branch,
        github_token, owner, repo,
    )


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
    print(f"\n[1/6] Reading gists for {date_str}...")

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
    print(f"\n[2/6] Generating daily summary...")
    summary = generate_summary(daily_gists, date_str, pollinations_token)
    if not summary:
        print("  Summary generation failed!")
        sys.exit(1)
    print(f"  {len(summary.get('arcs', []))} arcs: {summary.get('one_liner', '')}")

    # ── Generate platform posts ──────────────────────────────────────
    print(f"\n[3/6] Generating platform posts...")

    print("  Twitter...")
    twitter_post = generate_twitter_post(summary, pollinations_token)
    if twitter_post:
        tweet = twitter_post.get("tweet", "")
        print(f"  Twitter: {tweet[:80]}... ({len(tweet)} chars)")

    print("  Instagram...")
    instagram_post = generate_instagram_post(summary, pollinations_token)
    if instagram_post:
        img_count = len(instagram_post.get("images", []))
        print(f"  Instagram: {img_count} images")

    print("  Reddit...")
    reddit_post = generate_reddit_post(summary, pollinations_token)
    if reddit_post:
        print(f"  Reddit: {reddit_post.get('title', '')[:80]}")

    # ── Generate highlights + README ─────────────────────────────────
    print(f"\n[4/6] Generating highlights + README...")
    highlights_content, readme_content = generate_highlights_and_readme(pollinations_token, date_str)

    # ── Commit daily content to news branch ──────────────────────────
    print(f"\n[5/6] Committing daily content to news branch...")
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

    # ── Create README-only PR to main ────────────────────────────────
    if readme_content:
        print(f"\n[6/6] Creating README-only PR to main...")
        pr_number = create_readme_pr(
            date_str, readme_content,
            github_token, owner, repo,
        )
        if pr_number:
            print(f"  README PR #{pr_number} created")
        else:
            print("  Warning: Failed to create README PR (non-fatal)")
    else:
        print(f"\n[6/6] No README content — skipping PR")

    print("\n=== Done! ===")


if __name__ == "__main__":
    main()
