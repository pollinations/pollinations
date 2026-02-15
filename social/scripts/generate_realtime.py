#!/usr/bin/env python3
"""
Tier 1: PR Gist Generator

On PR merge:
  Step 1: AI analyzes PR → structured gist JSON → committed to news branch
  Step 2: Generate pixel art image → update gist with image URL

Discord posting is handled separately by publish_realtime.py.
See social/PIPELINE.md for full architecture.
"""

import os
import sys
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
    commit_gist,
    parse_json_response,
    github_api_request,
    GITHUB_API_BASE,
    GISTS_BRANCH,
    MODEL,
    OWNER,
    REPO,
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
    system_prompt = load_prompt("gist")

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

    return parse_json_response(response)


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
    image_prompt = gist["gist"].get("image_prompt", "")
    if not image_prompt:
        print("  No image prompt in gist")
        return None

    print(f"  Image prompt: {image_prompt[:100]}...")

    # Generate the image
    image_bytes, _ = generate_image(image_prompt, pollinations_token)
    if not image_bytes:
        print("  Image generation failed")
        return None

    # Commit image to repo on news branch
    date_str = gist["merged_at"][:10]
    image_path = f"social/news/gists/{date_str}/PR-{gist['pr_number']}.jpg"
    image_url = commit_image_to_branch(
        image_bytes, image_path, GISTS_BRANCH,
        github_token, owner, repo,
    )

    return image_url


# ── Main ─────────────────────────────────────────────────────────────

def main():
    print("=== Tier 1: PR Gist Generator ===")

    # Environment
    github_token = get_env("GITHUB_TOKEN")
    pollinations_token = get_env("POLLINATIONS_TOKEN")
    pr_number = get_env("PR_NUMBER")
    repo_full_name = get_env("REPO_FULL_NAME")

    owner, repo = repo_full_name.split("/")

    # ── Fetch PR data ────────────────────────────────────────────────
    print(f"\n[1/2] Analyzing PR #{pr_number}...")
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

    # Commit gist to news branch
    if not commit_gist(gist, github_token, owner, repo):
        print("  FATAL: Could not commit gist to news branch")
        sys.exit(1)

    print(f"  Gist committed: publish_tier={gist['gist']['publish_tier']}, "
          f"importance={gist['gist']['importance']}")

    # ── Step 2: Generate image → update gist ─────────────────────────
    print(f"\n[2/2] Generating image...")
    image_url = generate_gist_image(gist, pollinations_token, github_token, owner, repo)

    if image_url:
        gist["image"]["url"] = image_url
        # Re-commit gist with image URL
        commit_gist(gist, github_token, owner, repo)
        print(f"  Image URL: {image_url}")
    else:
        print("  No image generated — continuing without image")

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
