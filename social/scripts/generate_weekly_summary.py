#!/usr/bin/env python3
"""
Tier 3: Weekly Digest Generator

Sunday 00:00 UTC:
  1. Read daily summaries for the past 7 days
  2. AI synthesizes weekly themes → summary.md
  3. Generate platform posts (Twitter, LinkedIn, Instagram, Discord)
  4. Generate 5 platform images (1 twitter + 1 linkedin + 3 instagram)
  5. Create PR for review

Monday 08:00 UTC cron (publish_weekly.py) checks if PR was merged and publishes.

See social/PIPELINE.md for full architecture.
"""

import os
import sys
import json
import time
import base64
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
from pathlib import Path

from common import (
    load_prompt,
    get_env,
    get_repo_root,
    call_pollinations_api,
    generate_image,
    commit_image_to_branch,
    get_file_sha,
    get_merged_prs,
    GITHUB_API_BASE,
)

# ── Constants ────────────────────────────────────────────────────────

DAILY_REL_DIR = "social/news/daily"
WEEKLY_REL_DIR = "social/news/weekly"
IMAGE_SIZE = 2048


# ── Helpers ──────────────────────────────────────────────────────────

def get_week_range(override_start: Optional[str] = None):
    """Return (week_start, week_end) as YYYY-MM-DD strings.
    Default: Monday-Sunday of the week that just ended (when run Sunday 00:00 UTC)."""
    if override_start:
        start = datetime.strptime(override_start, "%Y-%m-%d")
    else:
        # Sunday 00:00 UTC — the week is Mon-Sun that just ended
        today = datetime.now(timezone.utc).date()
        # Go back to the most recent Monday
        days_since_monday = (today.weekday()) % 7  # Monday=0
        start = today - timedelta(days=days_since_monday)

    end = start + timedelta(days=6)
    return start.strftime("%Y-%m-%d") if hasattr(start, 'strftime') else str(start)[:10], \
           end.strftime("%Y-%m-%d") if hasattr(end, 'strftime') else str(end)[:10]


def parse_json_response(response: str) -> Optional[Dict]:
    """Parse JSON from AI response, stripping markdown fences."""
    text = response.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        print(f"  JSON parse error: {e}")
        print(f"  Response: {text[:500]}")
        return None


def read_daily_summaries(week_start: str, week_end: str, github_token: str,
                         owner: str, repo: str) -> List[Dict]:
    """Read daily summary.json files for each day in the week range.
    Tries local repo first, falls back to GitHub API."""
    repo_root = get_repo_root()
    summaries = []

    start = datetime.strptime(week_start, "%Y-%m-%d")
    end = datetime.strptime(week_end, "%Y-%m-%d")
    current = start

    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        local_path = Path(repo_root) / DAILY_REL_DIR / date_str / "summary.json"

        if local_path.exists():
            try:
                with open(local_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    data["_date"] = date_str
                    summaries.append(data)
            except (json.JSONDecodeError, OSError) as e:
                print(f"  Warning: skipping {local_path}: {e}")
        else:
            # Try GitHub API
            api_path = f"{DAILY_REL_DIR}/{date_str}/summary.json"
            headers = {
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {github_token}",
            }
            resp = requests.get(
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{api_path}",
                headers=headers,
            )
            if resp.status_code == 200:
                content = base64.b64decode(resp.json()["content"]).decode()
                try:
                    data = json.loads(content)
                    data["_date"] = date_str
                    summaries.append(data)
                except json.JSONDecodeError:
                    pass

        current += timedelta(days=1)

    return summaries


# ── Step 1: Generate weekly summary ─────────────────────────────────

def generate_digest(summaries: List[Dict], week_start: str, week_end: str,
                    token: str) -> Optional[Dict]:
    """Synthesize daily summaries into weekly summary."""
    system_prompt = load_prompt("_shared", "weekly_summary")

    # Build context from daily summaries
    daily_context = []
    for s in summaries:
        daily_context.append(json.dumps({
            "date": s.get("_date", s.get("date")),
            "pr_count": s.get("pr_count", 0),
            "one_liner": s.get("one_liner", ""),
            "arcs": s.get("arcs", []),
        }, indent=2))

    user_prompt = f"""Week: {week_start} to {week_end}
Days with summaries: {len(summaries)}
Total PRs: {sum(s.get('pr_count', 0) for s in summaries)}

Daily summaries:
{chr(10).join(daily_context)}"""

    response = call_pollinations_api(
        system_prompt, user_prompt, token,
        temperature=0.3, exit_on_failure=False
    )
    if not response:
        return None
    return parse_json_response(response)


# ── Step 2: Generate platform posts ─────────────────────────────────

def generate_twitter_post(digest: Dict, token: str) -> Optional[Dict]:
    """Generate weekly twitter.json using existing Twitter system prompt."""
    pr_summary = digest.get("pr_summary", "")
    system_template = load_prompt("twitter", "system")
    system_prompt = system_template.replace("{pr_summary}", pr_summary)

    user_template = load_prompt("twitter", "user_with_prs")
    arc_titles = [a["headline"] for a in digest.get("arcs", [])]
    user_prompt = user_template.replace("{pr_titles}", str(arc_titles))

    response = call_pollinations_api(
        system_prompt, user_prompt, token,
        temperature=0.8, exit_on_failure=False
    )
    if not response:
        return None
    return parse_json_response(response)


def generate_linkedin_post(digest: Dict, token: str) -> Optional[Dict]:
    """Generate weekly linkedin.json using existing LinkedIn system prompt."""
    pr_summary = digest.get("pr_summary", "")
    system_template = load_prompt("linkedin", "system")
    system_prompt = system_template.replace("{pr_summary}", pr_summary)

    user_template = load_prompt("linkedin", "user_with_prs")
    arc_titles = [a["headline"] for a in digest.get("arcs", [])]
    user_prompt = user_template.replace("{pr_titles}", str(arc_titles))
    user_prompt = user_prompt.replace("{pr_count}", str(digest.get("pr_count", 0)))

    response = call_pollinations_api(
        system_prompt, user_prompt, token,
        temperature=0.7, exit_on_failure=False
    )
    if not response:
        return None
    return parse_json_response(response)


def generate_instagram_post(digest: Dict, token: str) -> Optional[Dict]:
    """Generate weekly instagram.json using existing Instagram system prompt."""
    pr_summary = digest.get("pr_summary", "")
    system_template = load_prompt("instagram", "system")
    system_prompt = system_template.replace("{pr_summary}", pr_summary)

    user_template = load_prompt("instagram", "user_with_prs")
    arc_titles = [a["headline"] for a in digest.get("arcs", [])]
    user_prompt = user_template.replace("{pr_titles}", str(arc_titles))

    response = call_pollinations_api(
        system_prompt, user_prompt, token,
        temperature=0.7, exit_on_failure=False
    )
    if not response:
        return None
    return parse_json_response(response)


def generate_discord_post(digest: Dict, token: str, week_end: str) -> Optional[Dict]:
    """Generate weekly discord.json using existing Discord weekly prompt."""
    system_prompt = load_prompt("discord", "weekly_news_system")
    changelog = digest.get("changelog_md", "")

    user_template = load_prompt("discord", "weekly_news_user")
    user_prompt = user_template.replace("{date_str}", week_end).replace("{news_content}", changelog)

    response = call_pollinations_api(
        system_prompt, user_prompt, token,
        temperature=0.7, exit_on_failure=False
    )
    if not response:
        return None

    # Discord returns raw text, not JSON
    text = response.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)

    if text.upper().strip() == "SKIP":
        return None

    return {"message": text, "date": week_end}


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

    # Instagram: 3 images
    if instagram_post and instagram_post.get("images"):
        for i, img_info in enumerate(instagram_post["images"][:5]):
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
) -> Optional[int]:
    """Create a single PR with all weekly files."""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
    }

    # Get base SHA
    ref_resp = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/ref/heads/main",
        headers=headers,
    )
    if ref_resp.status_code != 200:
        print(f"Error getting ref: {ref_resp.text[:200]}")
        return None
    base_sha = ref_resp.json()["object"]["sha"]

    # Create branch
    branch = f"weekly-digest-{week_end}"
    create_resp = requests.post(
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
    )

    # Prepare files
    files_to_commit = []

    # summary.md — the changelog
    changelog = digest.get("changelog_md", "")
    if changelog:
        files_to_commit.append((f"{base_path}/summary.md", changelog, False))

    # Platform JSONs
    now_iso = datetime.now(timezone.utc).isoformat()
    for platform, post, filename in [
        ("twitter", twitter_post, "twitter.json"),
        ("linkedin", linkedin_post, "linkedin.json"),
        ("instagram", instagram_post, "instagram.json"),
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

        resp = requests.put(
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
When this PR is merged, the Monday 08:00 UTC cron will publish to all 4 platforms (Twitter, LinkedIn, Instagram via Buffer + Discord webhook).

Generated automatically by GitHub Actions.
"""

    # Create PR
    pr_resp = requests.post(
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
            list_resp = requests.get(
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls?head={owner}:{branch}&state=open",
                headers=headers,
            )
            if list_resp.status_code == 200 and list_resp.json():
                existing = list_resp.json()[0]
                requests.patch(
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
        requests.post(
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

    # ── Read daily summaries ─────────────────────────────────────────
    print(f"\n[1/4] Reading daily summaries...")
    summaries = read_daily_summaries(week_start, week_end, github_token, owner, repo)
    print(f"  Found {len(summaries)} daily summaries")

    if not summaries:
        print("  No daily summaries found. Skipping.")
        print("=== Done (no content) ===")
        return

    # ── Generate summary ─────────────────────────────────────────────
    print(f"\n[2/4] Generating weekly summary...")
    digest = generate_digest(summaries, week_start, week_end, pollinations_token)
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

    print("  Discord...")
    discord_post = generate_discord_post(digest, pollinations_token, week_end)

    # ── Create PR ────────────────────────────────────────────────────
    print(f"\n[4/4] Creating PR...")
    pr_number = create_weekly_pr(
        week_start, week_end, digest,
        twitter_post, linkedin_post, instagram_post, discord_post,
        github_token, owner, repo,
    )

    if pr_number:
        print(f"\n=== Done! PR #{pr_number} created ===")
    else:
        print("\n=== Failed to create PR ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
