#!/usr/bin/env python3
"""
Tier 3: Weekly Digest Generator

Sunday 06:00 UTC:
  1. Read gists for the past 7 days (Mon→Sun)
  2. AI synthesizes weekly themes
  3. Generate platform posts (Twitter, LinkedIn, Instagram, Reddit, Discord)
  4. Generate 7 platform images (1 twitter + 1 linkedin + 3 instagram + 1 reddit + 1 discord)
  5. Create PR for review

Sunday 18:00 UTC cron (publish_weekly.py) checks if PR was merged and publishes.

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
    load_format,
    get_env,
    get_repo_root,
    call_pollinations_api,
    generate_image,
    commit_image_to_branch,
    get_file_sha,
    read_gists_for_date,
    parse_json_response,
    github_api_request,
    GITHUB_API_BASE,
    IMAGE_SIZE,
    DEFAULT_TIMEOUT,
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
    Covers Sunday-to-Saturday: everything since last Sunday 6am UTC.
    Cron runs Sunday 06:00 UTC, so 'today' is the new Sunday and
    we look back 7 days to last Sunday through yesterday (Saturday)."""
    if override_start:
        start = datetime.strptime(override_start, "%Y-%m-%d").date()
    else:
        today = datetime.now(timezone.utc).date()
        start = today - timedelta(days=7)  # last Sunday

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


def filter_daily_gists(gists: List[Dict]) -> List[Dict]:
    """Filter gists to only those with publish_tier == 'daily'."""
    return [g for g in gists if g.get("gist", {}).get("publish_tier") == "daily"]


# ── Step 1: Generate weekly summary ─────────────────────────────────

def generate_digest(gists: List[Dict], week_start: str, week_end: str,
                    token: str) -> Optional[Dict]:
    """Synthesize PR gists into weekly summary."""
    system_prompt = load_prompt("weekly")

    # Build context from gists, grouped by date
    from collections import defaultdict
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
    """Generate weekly twitter.json."""
    voice = load_prompt("tone/twitter")
    pr_summary = digest.get("pr_summary", "")
    arc_titles = str([a["headline"] for a in digest.get("arcs", [])])
    pr_count = str(digest.get("pr_count", 0))

    task = f"Write a tweet about this week's shipped work.\n\n{pr_summary}\n\nMost impactful updates: {arc_titles}\nTotal PRs merged: {pr_count}\n\n" + load_format("twitter")
    task += _weekly_image_context()

    response = call_pollinations_api(voice, task, token, temperature=0.8, exit_on_failure=False)
    if not response:
        return None
    return parse_json_response(response)


def generate_linkedin_post(digest: Dict, token: str) -> Optional[Dict]:
    """Generate weekly linkedin.json."""
    voice = load_prompt("tone/linkedin")
    pr_summary = digest.get("pr_summary", "")
    arc_titles = str([a["headline"] for a in digest.get("arcs", [])])
    pr_count = str(digest.get("pr_count", 0))

    task = f"Create a LinkedIn post about this week's development work.\n\n{pr_summary}\n\nMost impactful updates: {arc_titles}\nTotal PRs merged: {pr_count}\n\n" + load_format("linkedin")
    task += _weekly_image_context()

    response = call_pollinations_api(voice, task, token, temperature=0.7, exit_on_failure=False)
    if not response:
        return None
    return parse_json_response(response)


def generate_instagram_post(digest: Dict, token: str) -> Optional[Dict]:
    """Generate weekly instagram.json."""
    voice = load_prompt("tone/instagram")
    pr_summary = digest.get("pr_summary", "")
    arc_titles = str([a["headline"] for a in digest.get("arcs", [])])
    pr_count = str(digest.get("pr_count", 0))

    task = f"Create a cozy pixel art post about this week's updates.\n\n{pr_summary}\n\nMost impactful updates: {arc_titles}\nTotal PRs merged: {pr_count}\n\n" + load_format("instagram")
    task += _weekly_image_context()

    response = call_pollinations_api(voice, task, token, temperature=0.7, exit_on_failure=False)
    if not response:
        return None
    return parse_json_response(response)


def generate_reddit_post(digest: Dict, token: str) -> Optional[Dict]:
    """Generate weekly reddit.json."""
    voice = load_prompt("tone/reddit")
    pr_summary = digest.get("pr_summary", "")
    arc_titles = str([a["headline"] for a in digest.get("arcs", [])])
    pr_count = str(digest.get("pr_count", 0))

    task = f"Create a Reddit post for this week's update.\n\n{pr_summary}\n\nMost impactful updates: {arc_titles}\nTotal PRs merged: {pr_count}\n\n" + load_format("reddit")
    task += _weekly_image_context()

    response = call_pollinations_api(voice, task, token, temperature=0.7, exit_on_failure=False)
    if not response:
        return None
    return parse_json_response(response)


def generate_discord_post(digest: Dict, token: str, week_end: str) -> Optional[Dict]:
    """Generate weekly discord.json."""
    voice = load_prompt("tone/discord")
    pr_summary = digest.get("pr_summary", "")
    arc_titles = str([a["headline"] for a in digest.get("arcs", [])])
    pr_count = str(digest.get("pr_count", 0))

    fmt = load_format("discord").replace("{date_str}", week_end)
    task = f"Write a Discord message about the latest updates.\n\n{pr_summary}\n\nMost impactful updates: {arc_titles}\nTotal PRs merged: {pr_count}\n\n" + fmt
    task += _weekly_image_context()

    response = call_pollinations_api(voice, task, token, temperature=0.7, exit_on_failure=False)
    if not response:
        return None

    text = response.strip()
    if text.upper().strip() == "SKIP":
        return None

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


# ── Step 4: Create PR ───────────────────────────────────────────────

def create_weekly_pr(
    week_start: str,
    week_end: str,
    digest: Dict,
    twitter_post: Optional[Dict],
    linkedin_post: Optional[Dict],
    instagram_post: Optional[Dict],
    discord_post: Optional[Dict],
    github_token: str,
    owner: str,
    repo: str,
    reddit_post: Optional[Dict] = None,
) -> Optional[int]:
    """Create a single PR with all weekly files."""
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
    branch = f"weekly-digest-{week_end}"
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

    base_path = f"{WEEKLY_REL_DIR}/{week_end}"
    pollinations_token = get_env("POLLINATIONS_TOKEN")

    # Generate images
    print("\n  Generating platform images...")
    generate_platform_images(
        twitter_post, linkedin_post, instagram_post,
        week_end, pollinations_token,
        github_token, owner, repo, branch,
        reddit_post=reddit_post,
        discord_post=discord_post,
    )

    # Prepare files
    files_to_commit = []

    # Platform JSONs
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
        files_to_commit.append((f"{base_path}/{filename}", json.dumps(post, indent=2, ensure_ascii=False), False))

    # Commit all files
    for file_path, content, is_raw in files_to_commit:
        encoded = base64.b64encode(content.encode() if isinstance(content, str) else content).decode()

        sha = get_file_sha(github_token, owner, repo, file_path, branch)
        if not sha:
            sha = get_file_sha(github_token, owner, repo, file_path, "main")

        payload = {
            "message": f"news: add {file_path.split('/')[-1]} for week of {week_end}",
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
        if resp.status_code in [200, 201]:
            print(f"  Committed {file_path}")
        else:
            print(f"  Error committing {file_path}: {resp.status_code} {resp.text[:200]}")

    # Build PR body
    theme = digest.get("theme", "")
    pr_count = digest.get("pr_count", 0)
    arc_preview = ""
    for arc in digest.get("arcs", []):
        arc_preview += f"\n**{arc['headline']}** ({arc['importance']})\n"
        arc_preview += f"{arc.get('summary', '')[:200]}\n"

    pr_body = f"""## Weekly Digest — {week_start} to {week_end}

**{theme}**

{pr_count} PRs merged across {len(digest.get('arcs', []))} themes.

### Themes
{arc_preview}

---
When this PR is merged, the Sunday 18:00 UTC cron will publish to all 5 platforms (Twitter, LinkedIn, Instagram via Buffer + Reddit API + Discord webhook).

Generated automatically by GitHub Actions.
"""

    # Create PR
    pr_resp = github_api_request(
        "POST",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls",
        headers=headers,
        json={
            "title": f"Weekly Digest — {week_start} to {week_end}",
            "body": pr_body,
            "head": branch,
            "base": "main",
        },
    )

    if pr_resp.status_code not in [200, 201]:
        if "A pull request already exists" in pr_resp.text:
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
                    json={"title": f"Weekly Digest — {week_start} to {week_end}", "body": pr_body},
                )
                print(f"  Updated existing PR #{existing['number']}")
                return existing["number"]
            return None
        print(f"  Error creating PR: {pr_resp.text[:200]}")
        return None

    pr_info = pr_resp.json()
    pr_number = pr_info["number"]
    print(f"  Created PR #{pr_number}: {pr_info['html_url']}")

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

    # ── Create PR ────────────────────────────────────────────────────
    print(f"\n[4/4] Creating PR...")
    pr_number = create_weekly_pr(
        week_start, week_end, digest,
        twitter_post, linkedin_post, instagram_post, discord_post,
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
