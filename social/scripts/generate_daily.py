#!/usr/bin/env python3
"""
Tier 2: Daily Summary Generator

At 06:00 UTC Mon-Sat:
  1. Read gists for yesterday (by merged_at date)
  2. Filter to publish_tier >= "daily"
  3. AI clusters gists into 3-5 narrative arcs
  4. Generate platform posts using existing prompts: twitter.json, instagram.json, reddit.json
  5. Generate platform images (1 twitter + 3 instagram + 1 reddit)
  Note: LinkedIn is weekly-only — no daily LinkedIn posts.
  6. Create single PR with all files

See social/PIPELINE.md for full architecture.
"""

import os
import sys
import json
import time
import base64
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
from pathlib import Path

from common import (
    load_prompt,
    load_format,
    get_env,
    get_repo_root,
    call_pollinations_api,
    generate_image,
    commit_image_to_branch,
    get_file_sha,
    read_gists_for_date,
    get_merged_prs,
    format_pr_summary,
    parse_json_response,
    github_api_request,
    GITHUB_API_BASE,
    OWNER,
    REPO,
    IMAGE_SIZE,
    DEFAULT_TIMEOUT,
)

# ── Constants ────────────────────────────────────────────────────────

DAILY_REL_DIR = "social/news/daily"


# ── Helpers ──────────────────────────────────────────────────────────

def get_target_date(override: Optional[str] = None) -> str:
    """Get the target date (YYYY-MM-DD). Defaults to yesterday UTC."""
    if override:
        return override
    yesterday = datetime.now(timezone.utc) - timedelta(days=1)
    return yesterday.strftime("%Y-%m-%d")


def filter_daily_gists(gists: List[Dict]) -> List[Dict]:
    """Filter gists to only those with publish_tier == 'daily'."""
    return [g for g in gists if g.get("gist", {}).get("publish_tier") == "daily"]


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
    """Generate twitter.json."""
    voice = load_prompt("tone/twitter")
    pr_summary = summary.get("pr_summary", "")
    arc_titles = str([a["headline"] for a in summary.get("arcs", [])])

    task = f"Write a tweet about today's shipped work.\n\n{pr_summary}\n\nMost interesting updates: {arc_titles}\n\n" + load_format("twitter")

    response = call_pollinations_api(voice, task, token, temperature=0.8, exit_on_failure=False)
    if not response:
        return None
    return parse_json_response(response)


def generate_instagram_post(summary: Dict, token: str) -> Optional[Dict]:
    """Generate instagram.json."""
    voice = load_prompt("tone/instagram")
    pr_summary = summary.get("pr_summary", "")
    arc_titles = str([a["headline"] for a in summary.get("arcs", [])])

    task = f"Create a cozy pixel art post about these updates.\n\n{pr_summary}\n\nMost interesting updates: {arc_titles}\n\n" + load_format("instagram")

    response = call_pollinations_api(voice, task, token, temperature=0.7, exit_on_failure=False)
    if not response:
        return None
    return parse_json_response(response)


def generate_reddit_post(summary: Dict, token: str) -> Optional[Dict]:
    """Generate reddit.json."""
    voice = load_prompt("tone/reddit")
    pr_summary = summary.get("pr_summary", "")
    arc_titles = str([a["headline"] for a in summary.get("arcs", [])])

    task = f"Create a Reddit post for today's update.\n\n{pr_summary}\n\nMost interesting updates: {arc_titles}\n\n" + load_format("reddit")

    response = call_pollinations_api(voice, task, token, temperature=0.7, exit_on_failure=False)
    if not response:
        return None
    return parse_json_response(response)


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


# ── Step 4: Create PR ───────────────────────────────────────────────

def create_daily_pr(
    date_str: str,
    summary: Dict,
    twitter_post: Optional[Dict],
    instagram_post: Optional[Dict],
    github_token: str,
    owner: str,
    repo: str,
    reddit_post: Optional[Dict] = None,
) -> Optional[int]:
    """Create a single PR with all daily post files. Returns PR number."""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
    }

    # Get base SHA
    ref_resp = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/ref/heads/main",
        headers=headers,
    )
    if ref_resp.status_code != 200:
        print(f"Error getting ref: {ref_resp.text[:200]}")
        return None
    base_sha = ref_resp.json()["object"]["sha"]

    # Create branch
    branch = f"daily-summary-{date_str}"
    create_resp = github_api_request(
        "POST",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/refs",
        headers=headers,
        json={"ref": f"refs/heads/{branch}", "sha": base_sha},
    )
    if create_resp.status_code not in [200, 201]:
        if "Reference already exists" not in create_resp.text:
            print(f"Error creating branch: {create_resp.text[:200]}")
            return None
        print(f"  Branch {branch} already exists, updating...")

    base_path = f"{DAILY_REL_DIR}/{date_str}"

    # Commit JSON files
    files_to_commit = []
    if twitter_post:
        # Add platform metadata
        twitter_post["date"] = date_str
        twitter_post["generated_at"] = datetime.now(timezone.utc).isoformat()
        twitter_post["platform"] = "twitter"
        files_to_commit.append((f"{base_path}/twitter.json", twitter_post))
    if instagram_post:
        instagram_post["date"] = date_str
        instagram_post["generated_at"] = datetime.now(timezone.utc).isoformat()
        instagram_post["platform"] = "instagram"  # used by buffer_publish to detect platform
        instagram_post["post_type"] = "carousel" if len(instagram_post.get("images", [])) > 1 else "single"
        files_to_commit.append((f"{base_path}/instagram.json", instagram_post))
    if reddit_post:
        reddit_post["date"] = date_str
        reddit_post["generated_at"] = datetime.now(timezone.utc).isoformat()
        reddit_post["platform"] = "reddit"
        files_to_commit.append((f"{base_path}/reddit.json", reddit_post))

    # Generate images (commits them to the branch)
    print("\n  Generating platform images...")
    generate_platform_images(
        twitter_post, instagram_post,
        date_str, get_env("POLLINATIONS_TOKEN"),
        github_token, owner, repo, branch,
        reddit_post=reddit_post,
    )

    for file_path, data in files_to_commit:
        if data is None:
            continue
        content = json.dumps(data, indent=2, ensure_ascii=False)
        encoded = base64.b64encode(content.encode()).decode()

        sha = get_file_sha(github_token, owner, repo, file_path, branch)
        if not sha:
            sha = get_file_sha(github_token, owner, repo, file_path, "main")

        payload = {
            "message": f"news: add {file_path.split('/')[-1]} for {date_str}",
            "content": encoded,
            "branch": branch,
        }
        if sha:
            payload["sha"] = sha

        resp = github_api_request(
            "PUT",
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{file_path}",
            headers=headers,
            json=payload,
        )
        if resp.status_code not in [200, 201]:
            print(f"  Error committing {file_path}: {resp.status_code} {resp.text[:200]}")
        else:
            print(f"  Committed {file_path}")

    # Build PR body
    arc_preview = ""
    for arc in summary.get("arcs", []):
        arc_preview += f"\n**{arc['headline']}** ({arc['importance']})\n"
        arc_preview += f"{arc['summary']}\n"
        arc_preview += f"PRs: {', '.join(f'#{p}' for p in arc.get('prs', []))}\n"

    pr_count = summary.get("pr_count", 0)
    one_liner = summary.get("one_liner", "")

    # Twitter preview
    twitter_preview = ""
    if twitter_post:
        tweet = twitter_post.get("tweet", twitter_post.get("full_tweet", ""))
        twitter_preview = f"\n### Twitter\n```\n{tweet}\n```\n"

    # Instagram preview
    instagram_preview = ""
    if instagram_post:
        caption = instagram_post.get("caption", "")[:200]
        img_count = len(instagram_post.get("images", []))
        instagram_preview = f"\n### Instagram ({img_count} images)\n{caption}...\n"

    # Reddit preview
    reddit_preview = ""
    if reddit_post:
        title = reddit_post.get("title", "")
        reddit_preview = f"\n### Reddit\n**Title:** {title}\n"

    pr_body = f"""## Daily Summary — {date_str}

**{one_liner}**

{pr_count} PRs merged, {len(summary.get('arcs', []))} narrative arcs.

### Story Arcs
{arc_preview}
{twitter_preview}{instagram_preview}{reddit_preview}
---
When this PR is merged, posts will be staged to Buffer (Twitter, Instagram) and highlights + README updated. Reddit daily is handled by the TypeScript app. LinkedIn is weekly-only.

Generated automatically by GitHub Actions.
"""

    # Create PR
    pr_resp = github_api_request(
        "POST",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls",
        headers=headers,
        json={
            "title": f"Daily Summary — {date_str}",
            "body": pr_body,
            "head": branch,
            "base": "main",
        },
    )

    if pr_resp.status_code not in [200, 201]:
        if "A pull request already exists" in pr_resp.text:
            # Update existing PR
            list_resp = github_api_request(
                "GET",
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls?head={owner}:{branch}&state=open",
                headers=headers,
            )
            if list_resp.status_code == 200 and list_resp.json():
                existing = list_resp.json()[0]
                github_api_request(
                    "PATCH",
                    f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls/{existing['number']}",
                    headers=headers,
                    json={"title": f"Daily Summary — {date_str}", "body": pr_body},
                )
                print(f"  Updated existing PR #{existing['number']}")
                return existing["number"]
            print("  PR already exists but could not update it")
            return None
        print(f"  Error creating PR: {pr_resp.text[:200]}")
        return None

    pr_info = pr_resp.json()
    pr_number = pr_info["number"]
    print(f"  Created PR #{pr_number}: {pr_info['html_url']}")

    # Add labels
    pr_labels = get_env("PR_LABELS", required=False)
    if pr_labels:
        labels_list = [l.strip() for l in pr_labels.split(",")]
        github_api_request(
            "POST",
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/issues/{pr_number}/labels",
            headers=headers,
            json={"labels": labels_list},
        )

    return pr_number


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
    print(f"\n[1/4] Reading gists for {date_str}...")

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
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{gists_dir}",
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
    print(f"\n[2/4] Generating daily summary...")
    summary = generate_summary(daily_gists, date_str, pollinations_token)
    if not summary:
        print("  Summary generation failed!")
        sys.exit(1)
    print(f"  {len(summary.get('arcs', []))} arcs: {summary.get('one_liner', '')}")

    # ── Generate platform posts ──────────────────────────────────────
    print(f"\n[3/4] Generating platform posts...")

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

    # ── Create PR ────────────────────────────────────────────────────
    print(f"\n[4/4] Creating PR...")
    pr_number = create_daily_pr(
        date_str, summary,
        twitter_post, instagram_post,
        github_token, owner, repo,
        reddit_post=reddit_post,
    )

    if pr_number:
        print(f"\n=== Done! PR #{pr_number} created ===")
    else:
        print("\n=== Failed to create PR ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
