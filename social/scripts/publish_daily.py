#!/usr/bin/env python3
"""
Tier 2: Daily Publish

Triggered when a daily summary PR is merged. Does three things:
  1. Buffer staging for Twitter, Instagram
  2. Update highlights.md
  3. Update README.md "Latest News" section

LinkedIn is weekly-only (no daily posts).
Reddit daily is handled by the TypeScript app (not this script).
Reuses existing buffer_publish.py and update_highlights/update_readme logic.
"""

import os
import sys
import json
from datetime import datetime, timezone
from typing import Dict, Optional
import paramiko
import base64
import io
from common import (
    get_env,
    github_api_request,
    GITHUB_API_BASE,
    call_pollinations_api,
    get_file_sha,
    deploy_reddit_post,
)
from buffer_publish import (
    publish_twitter_post,
    publish_instagram_post,
    add_pr_comment,
)
from update_highlights import (
    get_current_highlights,
    get_links_file,
    create_highlights_prompt,
    parse_response,
    merge_highlights,
)
from update_readme import (
    get_file_content,
    get_top_highlights,
    update_readme_news_section,
)

# Paths
DAILY_DIR = "social/news/daily"
HIGHLIGHTS_PATH = "social/news/highlights.md"
README_PATH = "README.md"
MAX_README_ENTRIES = 10


def find_daily_date_from_pr(github_token: str, repo: str, pr_number: int) -> Optional[str]:
    """Detect the daily date from files changed in the merged PR."""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
    }
    resp = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{repo}/pulls/{pr_number}/files",
        headers=headers,
    )
    if resp.status_code != 200:
        return None

    for f in resp.json():
        filename = f.get("filename", "")
        # Match social/news/daily/YYYY-MM-DD/anything
        if filename.startswith(f"{DAILY_DIR}/"):
            parts = filename.split("/")
            # Expected: social/news/daily/YYYY-MM-DD/file.json → parts[3] = date
            if len(parts) >= 5:
                return parts[3]  # YYYY-MM-DD
    return None


def stage_buffer_posts(daily_dir: str, buffer_token: str) -> Dict[str, bool]:
    """Stage all platform posts to Buffer. Returns {platform: success}."""
    results = {}

    for platform, filename, publish_fn in [
        ("twitter", "twitter.json", publish_twitter_post),
        ("instagram", "instagram.json", publish_instagram_post),
    ]:
        post_path = os.path.join(daily_dir, filename)
        if not os.path.exists(post_path):
            print(f"  No {filename} found — skipping {platform}")
            continue

        print(f"\n  Staging {platform}...")
        try:
            with open(post_path, "r", encoding="utf-8") as f:
                post_data = json.load(f)
            results[platform] = publish_fn(post_data, buffer_token)
        except Exception as e:
            print(f"  Error staging {platform}: {e}")
            results[platform] = False

    return results



def update_highlights(
    summary: Dict,
    github_token: str,
    pollinations_token: str,
    owner: str,
    repo: str,
) -> bool:
    """Generate new highlights from summary and commit directly to main."""
    # Build a news-like content from the summary for the highlights prompt
    arcs = summary.get("arcs", [])
    if not arcs:
        print("  No arcs in summary — skipping highlights")
        return True

    date_str = summary.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))

    # Build news content from arcs
    news_lines = [f"# Updates for {date_str}\n"]
    for arc in arcs:
        news_lines.append(f"## {arc['headline']}")
        news_lines.append(arc.get("summary", ""))
        news_lines.append("")
    news_content = "\n".join(news_lines)

    # Get links file for reference
    links_content = get_links_file(github_token, owner, repo)

    # Generate highlights using AI
    system_prompt, user_prompt = create_highlights_prompt(news_content, date_str, links_content)
    ai_response = call_pollinations_api(
        system_prompt, user_prompt, pollinations_token,
        temperature=0.3, exit_on_failure=False,
    )
    if not ai_response:
        print("  Highlights generation failed")
        return False

    new_highlights = parse_response(ai_response)
    if not new_highlights.strip() or new_highlights.upper().strip() == "SKIP":
        print("  AI returned SKIP — no highlights this day")
        return True

    # Merge with existing highlights
    existing = get_current_highlights(github_token, owner, repo)
    merged = merge_highlights(new_highlights, existing)

    # Commit directly to main
    import base64
    encoded = base64.b64encode(merged.encode()).decode()
    sha = get_file_sha(github_token, owner, repo, HIGHLIGHTS_PATH, "main")

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
    }
    payload = {
        "message": f"docs: update highlights — {date_str}",
        "content": encoded,
        "branch": "main",
    }
    if sha:
        payload["sha"] = sha

    resp = github_api_request(
        "PUT",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{HIGHLIGHTS_PATH}",
        headers=headers,
        json=payload,
    )
    if resp.status_code in [200, 201]:
        print(f"  Updated {HIGHLIGHTS_PATH}")
        return True
    print(f"  Failed to update highlights: {resp.status_code} {resp.text[:200]}")
    return False


def update_readme(github_token: str, owner: str, repo: str) -> bool:
    """Update README "Latest News" section from highlights.md. Commits directly to main."""
    highlights_content, _ = get_file_content(github_token, owner, repo, HIGHLIGHTS_PATH)
    if not highlights_content:
        print("  No highlights.md found — skipping README update")
        return True

    top_entries = get_top_highlights(highlights_content, MAX_README_ENTRIES)
    if not top_entries:
        print("  No highlight entries — skipping README update")
        return True

    readme_content, readme_sha = get_file_content(github_token, owner, repo, README_PATH)
    if not readme_content:
        print("  Could not fetch README.md")
        return False

    updated = update_readme_news_section(readme_content, top_entries)
    if not updated or updated == readme_content:
        print("  No changes to README")
        return True

    # Commit directly to main
    import base64
    encoded = base64.b64encode(updated.encode()).decode()
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
    }
    payload = {
        "message": f"docs: update README latest news",
        "content": encoded,
        "branch": "main",
        "sha": readme_sha,
    }
    resp = github_api_request(
        "PUT",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{README_PATH}",
        headers=headers,
        json=payload,
    )
    if resp.status_code in [200, 201]:
        print(f"  Updated README.md")
        return True
    print(f"  Failed to update README: {resp.status_code} {resp.text[:200]}")
    return False


# ── Main ─────────────────────────────────────────────────────────────

def main():
    print("=== Tier 2: Daily Publish ===")

    github_token = get_env("GITHUB_TOKEN")
    buffer_token = get_env("BUFFER_ACCESS_TOKEN")
    pollinations_token = get_env("POLLINATIONS_TOKEN")
    repo_full = get_env("GITHUB_REPOSITORY")
    pr_number_str = get_env("PR_NUMBER", required=False)
    pr_number = int(pr_number_str) if pr_number_str else None

    owner, repo = repo_full.split("/")

    # Detect date from PR files
    date_str = None
    if pr_number:
        date_str = find_daily_date_from_pr(github_token, repo_full, pr_number)
    if not date_str:
        date_str = get_env("TARGET_DATE", required=False)
    if not date_str:
        print("Error: Could not determine daily date from PR or TARGET_DATE")
        sys.exit(1)

    daily_dir = os.path.join("social", "news", "daily", date_str)
    print(f"  Date: {date_str}")
    print(f"  Dir: {daily_dir}")

    # Read summary for highlights generation
    summary_path = os.path.join(daily_dir, "summary.json")
    summary = {}
    if os.path.exists(summary_path):
        with open(summary_path, "r", encoding="utf-8") as f:
            summary = json.load(f)

    # ── 1. Buffer staging (Twitter + Instagram) ─────────────────────
    print(f"\n[1/4] Staging to Buffer...")
    results = stage_buffer_posts(daily_dir, buffer_token)
    for platform, success in results.items():
        status = "OK" if success else "FAILED"
        print(f"  {platform}: {status}")

    # ── 2. Deploy Reddit to VPS ────────────────────────────────────
    print(f"\n[2/4] Deploying Reddit to VPS...")
    vps_host = get_env("REDDIT_VPS_HOST", required=False)
    vps_user = get_env("REDDIT_VPS_USER", required=False)
    vps_ssh_key = get_env("REDDIT_VPS_SSH_KEY", required=False)
    vps_ssh_key = get_env("REDDIT_VPS_SSH_KEY", required=False).strip()
    private_key_str = base64.b64decode(vps_ssh_key).decode("utf-8")
    key_file = io.StringIO(private_key_str)
    pkey = paramiko.Ed25519Key.from_private_key(key_file)

    if vps_host and vps_user and vps_ssh_key:
        reddit_data = {}
        reddit_path = os.path.join(daily_dir, "reddit.json")
        if os.path.exists(reddit_path):
            with open(reddit_path, "r", encoding="utf-8") as f:
                reddit_data = json.load(f)

        if reddit_data:
            deploy_reddit_post(reddit_data, vps_host, vps_user, pkey)
        else:
            print("  No reddit.json — skipping VPS deployment")
    else:
        print("  VPS credentials not configured — skipping VPS deployment")

    # ── 3. Update highlights ─────────────────────────────────────────
    print(f"\n[3/4] Updating highlights...")
    update_highlights(summary, github_token, pollinations_token, owner, repo)

    # ── 4. Update README ─────────────────────────────────────────────
    print(f"\n[4/4] Updating README...")
    update_readme(github_token, owner, repo)

    # PR comment
    if pr_number:
        buffer_platforms = [p for p, s in results.items() if s]
        failed = [p for p, s in results.items() if not s]
        msg = f"Daily publish complete for {date_str}.\n"
        if buffer_platforms:
            msg += f"- Staged to Buffer: {', '.join(buffer_platforms)}\n"
        if failed:
            msg += f"- Failed: {', '.join(failed)}\n"
        msg += "- Highlights + README updated"
        add_pr_comment(github_token, repo_full, pr_number, msg)

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
