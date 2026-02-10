#!/usr/bin/env python3
"""
Tier 1: PR Gist Generator

On PR merge:
  Step 1: AI analyzes PR → structured gist JSON → committed to main
  Step 2: Generate pixel art image → update gist with image URL
  Step 3: Post to Discord (best-effort)

See social/PIPELINE.md for full architecture.
"""

import os
import sys
import json
import requests
from datetime import datetime, timezone
from typing import Dict, Optional

from common import (
    load_prompt,
    get_env,
    get_repo_root,
    call_pollinations_api,
    generate_image,
    commit_image_to_branch,
    validate_gist,
    apply_publish_tier_rules,
    build_minimal_gist,
    gist_path_for_pr,
    commit_gist_to_main,
    github_api_request,
    GITHUB_API_BASE,
    MODEL,
    OWNER,
    REPO,
    DISCORD_CHAR_LIMIT,
    DEFAULT_TIMEOUT,
)


# ── GitHub helpers ───────────────────────────────────────────────────

def fetch_pr_data(repo: str, pr_number: str, token: str) -> Dict:
    """Fetch full PR data from GitHub REST API."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    url = f"{GITHUB_API_BASE}/repos/{repo}/pulls/{pr_number}"
    resp = github_api_request("GET", url, headers=headers)
    if resp.status_code != 200:
        print(f"GitHub API error: {resp.status_code} {resp.text[:300]}")
        sys.exit(1)
    return resp.json()


def fetch_pr_files(repo: str, pr_number: str, token: str) -> str:
    """Fetch list of changed files as a formatted string."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }
    all_files = []
    page = 1
    while True:
        url = f"{GITHUB_API_BASE}/repos/{repo}/pulls/{pr_number}/files?per_page=100&page={page}"
        resp = github_api_request("GET", url, headers=headers)
        if resp.status_code != 200:
            break
        files = resp.json()
        if not files:
            break
        all_files.extend(files)
        if len(files) < 100:
            break
        page += 1

    lines = []
    for f in all_files:
        status = f.get("status", "modified")
        filename = f.get("filename", "")
        changes = f.get("changes", 0)
        lines.append(f"  {status}: {filename} (+{f.get('additions', 0)}/-{f.get('deletions', 0)})")
    return "\n".join(lines) if lines else "(no files changed)"


# ── Step 1: AI analysis ─────────────────────────────────────────────

def analyze_pr(pr_data: Dict, files_summary: str, token: str) -> Optional[Dict]:
    """Call AI to analyze a PR and return structured gist JSON.

    Returns parsed dict on success, None on failure (after retries).
    """
    system_prompt = load_prompt("_shared", "pr_analyzer")

    # Build user prompt with PR context
    # Trust boundary: PR body comes from merged PRs (requires repo write access),
    # not arbitrary user input. Truncated to 2000 chars as a size guard.
    labels = [l["name"] for l in pr_data.get("labels", [])]
    body = pr_data.get("body") or ""
    user_prompt = f"""PR #{pr_data['number']}: {pr_data['title']}

Author: {pr_data.get('user', {}).get('login', 'unknown')}
Labels: {', '.join(labels) if labels else 'none'}
Branch: {pr_data.get('head', {}).get('ref', 'unknown')} → {pr_data.get('base', {}).get('ref', 'main')}

Description:
{body[:2000] if body else 'No description provided.'}

Changed files:
{files_summary}"""

    response = call_pollinations_api(
        system_prompt, user_prompt, token,
        temperature=0.2, exit_on_failure=False
    )

    if not response:
        return None

    # Parse JSON from response (strip markdown fences if present)
    text = response.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last lines (fences)
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        print(f"  Failed to parse AI response as JSON: {e}")
        print(f"  Response: {text[:500]}")
        return None


def build_full_gist(pr_data: Dict, ai_analysis: Dict) -> Dict:
    """Build the complete gist object from PR data + AI analysis."""
    labels = [l["name"] for l in pr_data.get("labels", [])]
    author = pr_data.get("user", {}).get("login", "unknown")

    gist = {
        "pr_number": pr_data["number"],
        "title": pr_data["title"],
        "author": author,
        "url": pr_data["html_url"],
        "merged_at": pr_data.get("merged_at", datetime.now(timezone.utc).isoformat()),
        "labels": labels,
        "gist": ai_analysis,
        "image": {"url": None, "prompt": None},
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    # Apply hard rules for publish_tier
    gist["gist"]["publish_tier"] = apply_publish_tier_rules(gist)

    return gist


# ── Step 2: Image generation ────────────────────────────────────────

def generate_gist_image(gist: Dict, pollinations_token: str,
                        github_token: str, owner: str, repo: str) -> Optional[str]:
    """Generate pixel art image for a gist. Returns image URL or None."""
    # Generate image prompt from discord_snippet
    image_prompt_system = load_prompt("discord", "image_prompt_system")
    snippet = gist["gist"].get("discord_snippet", gist["title"])

    image_prompt = call_pollinations_api(
        image_prompt_system, snippet, pollinations_token,
        temperature=0.7, exit_on_failure=False
    )

    if not image_prompt:
        print("  Failed to generate image prompt")
        return None

    image_prompt = image_prompt.strip()
    print(f"  Image prompt: {image_prompt[:100]}...")

    # Generate the image
    image_bytes, _ = generate_image(image_prompt, pollinations_token)
    if not image_bytes:
        print("  Image generation failed")
        return None

    # Commit image to repo on main
    date_str = gist["merged_at"][:10]
    image_path = f"social/news/gists/{date_str}/PR-{gist['pr_number']}.jpg"
    image_url = commit_image_to_branch(
        image_bytes, image_path, "main",
        github_token, owner, repo,
    )

    return image_url


# ── Step 3: Discord post ────────────────────────────────────────────

def post_to_discord(webhook_url: str, gist: Dict, image_url: Optional[str]):
    """Post gist announcement to Discord. Best-effort — failures are logged, not fatal."""
    snippet = gist["gist"].get("discord_snippet", gist["title"])

    # Format message with PR metadata footer
    pr_number = gist["pr_number"]
    pr_url = gist["url"]
    author = gist["author"]
    merged_at = gist.get("merged_at", "")

    # Discord timestamp
    timestamp_str = ""
    if merged_at:
        try:
            if merged_at.endswith("Z"):
                dt = datetime.fromisoformat(merged_at.replace("Z", "+00:00"))
            else:
                dt = datetime.fromisoformat(merged_at)
            unix_ts = int(dt.timestamp())
            timestamp_str = f" <t:{unix_ts}:F>"
        except Exception:
            pass

    pr_link = f"[PR #{pr_number}](<{pr_url}>)"
    author_link = f"[{author}](<https://github.com/{author}>)"
    footer = f"\n\n{pr_link} | By {author_link}{timestamp_str}"

    message = snippet + footer

    # Truncate if needed
    if len(message) > DISCORD_CHAR_LIMIT:
        available = DISCORD_CHAR_LIMIT - len(footer) - 3
        message = snippet[:available] + "..." + footer

    # Download image for embed if available
    image_bytes = None
    if image_url:
        try:
            resp = requests.get(image_url, timeout=30)
            if resp.status_code == 200 and "image" in resp.headers.get("content-type", ""):
                image_bytes = resp.content
        except Exception as e:
            print(f"  Could not download image for Discord: {e}")

    # Post to Discord
    try:
        if image_bytes:
            files = {
                "payload_json": (None, json.dumps({"content": message}), "application/json"),
                "files[0]": ("image.jpg", image_bytes, "image/jpeg"),
            }
            resp = requests.post(webhook_url, files=files)
        else:
            resp = requests.post(webhook_url, json={"content": message})

        if resp.status_code in [200, 204]:
            print("  Discord post sent")
        else:
            print(f"  Discord webhook error: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"  Discord post failed: {e}")


# ── Main ─────────────────────────────────────────────────────────────

def main():
    print("=== Tier 1: PR Gist Generator ===")

    # Environment
    github_token = get_env("GITHUB_TOKEN")
    pollinations_token = get_env("POLLINATIONS_TOKEN")
    discord_webhook = get_env("DISCORD_WEBHOOK_URL")
    pr_number = get_env("PR_NUMBER")
    repo_full_name = get_env("REPO_FULL_NAME")

    owner, repo = repo_full_name.split("/")

    # ── Fetch PR data ────────────────────────────────────────────────
    print(f"\n[1/3] Analyzing PR #{pr_number}...")
    pr_data = fetch_pr_data(repo_full_name, pr_number, github_token)
    files_summary = fetch_pr_files(repo_full_name, pr_number, github_token)

    labels = [l["name"] for l in pr_data.get("labels", [])]
    merged_at = pr_data.get("merged_at", datetime.now(timezone.utc).isoformat())
    author = pr_data.get("user", {}).get("login", "unknown")

    # ── Step 1: AI analysis → gist JSON → commit ────────────────────
    ai_analysis = analyze_pr(pr_data, files_summary, pollinations_token)

    if ai_analysis:
        gist = build_full_gist(pr_data, ai_analysis)

        # Validate
        errors = validate_gist(gist)
        if errors:
            print(f"  Schema validation warnings: {errors}")
            # Fall back to minimal gist on validation failure
            gist = build_minimal_gist(
                int(pr_number), pr_data["title"], author,
                pr_data["html_url"], merged_at, labels
            )
            print("  Using minimal gist due to validation errors")
    else:
        print("  AI analysis failed — using minimal gist")
        gist = build_minimal_gist(
            int(pr_number), pr_data["title"], author,
            pr_data["html_url"], merged_at, labels
        )

    # Commit gist to main
    if not commit_gist_to_main(gist, github_token, owner, repo):
        print("  FATAL: Could not commit gist to main")
        sys.exit(1)

    print(f"  Gist committed: publish_tier={gist['gist']['publish_tier']}, "
          f"importance={gist['gist']['importance']}")

    # ── Step 2: Generate image → update gist ─────────────────────────
    print(f"\n[2/3] Generating image...")
    image_url = generate_gist_image(gist, pollinations_token, github_token, owner, repo)

    if image_url:
        gist["image"]["url"] = image_url
        # Re-commit gist with image URL
        commit_gist_to_main(gist, github_token, owner, repo)
        print(f"  Image URL: {image_url}")
    else:
        print("  No image generated — continuing without image")

    # ── Step 3: Discord post ─────────────────────────────────────────
    print(f"\n[3/3] Posting to Discord...")
    post_to_discord(discord_webhook, gist, image_url)

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
