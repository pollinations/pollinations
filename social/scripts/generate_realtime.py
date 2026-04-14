#!/usr/bin/env python3
"""
Tier 1: PR Gist Generator

On PR merge:
  Step 1: AI analyzes PR → structured gist JSON
  Step 2: Generate pixel art image → commit image + gist to news branch

Discord posting is handled separately by publish_realtime.py.
See social/PIPELINE.md for full architecture.
"""

import os
import re
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
    commit_gist,
    parse_json_response,
    github_api_request,
    GITHUB_API_BASE,
    GISTS_BRANCH,
    MODEL,
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


def fetch_pr_files(repo: str, pr_number: str, token: str) -> tuple:
    """Fetch list of changed files. Returns (formatted_string, list_of_filenames)."""
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

    filenames = [f.get("filename", "") for f in all_files]
    lines = []
    for f in all_files:
        status = f.get("status", "modified")
        filename = f.get("filename", "")
        changes = f.get("changes", 0)
        lines.append(f"  {status}: {filename} (+{f.get('additions', 0)}/-{f.get('deletions', 0)})")
    summary = "\n".join(lines) if lines else "(no files changed)"
    return summary, filenames


# ── APPS.md lookup ──────────────────────────────────────────────────

def lookup_newest_app() -> Optional[Dict]:
    """Read apps/APPS.md and return the newest app's name and URL.

    APPS.md is sorted newest-first, so the first data row is the newest app.
    Returns {"app_name": str, "app_url": str} or None.
    """
    repo_root = get_repo_root()
    apps_path = os.path.join(repo_root, "apps", "APPS.md")
    if not os.path.exists(apps_path):
        return None

    with open(apps_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Find the header and first data row (skip header + separator)
    data_lines = [l.strip() for l in lines if l.strip().startswith("|") and not l.strip().startswith("| -")]
    if len(data_lines) < 2:
        return None

    # Parse header to find column indices
    header_cols = [c.strip() for c in data_lines[0].split("|")]
    # First data row (newest app)
    row_cols = [c.strip() for c in data_lines[1].split("|")]

    def col_val(name):
        try:
            idx = header_cols.index(name)
            return row_cols[idx] if idx < len(row_cols) else ""
        except ValueError:
            return ""

    name = col_val("Name")
    web_url = col_val("Web_URL")
    github_repo_url = col_val("Github_Repository_URL")

    if not name:
        return None

    # Prefer Web_URL, fall back to Github_Repository_URL
    app_url = web_url or github_repo_url
    if not app_url:
        return None

    return {"app_name": name, "app_url": app_url}


# ── Step 1: AI analysis ─────────────────────────────────────────────

def analyze_pr(pr_data: Dict, files_summary: str, token: str) -> Optional[Dict]:
    """Call AI to analyze a PR and return structured gist JSON."""
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
    return parse_json_response(response) if response else None


def build_full_gist(pr_data: Dict, ai_analysis: Dict, changed_files: list) -> Dict:
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

    # Detect app submissions: only add app link when a new app was actually added
    # App submission branches are "auto/app-{issue}-{slug}", metrics are "auto/app-metrics-{date}"
    branch = pr_data.get("head", {}).get("ref", "")
    is_app_pr = "apps/APPS.md" in changed_files and re.match(r"auto/app-\d+", branch)
    if is_app_pr:
        app_info = lookup_newest_app()
        if app_info:
            gist["app_name"] = app_info["app_name"]
            gist["app_url"] = app_info["app_url"]
            print(f"  App detected: {app_info['app_name']} → {app_info['app_url']}")

    return gist


# ── Step 2: Image generation ────────────────────────────────────────

def generate_gist_image(gist: Dict, pollinations_token: str,
                        github_token: str, owner: str, repo: str) -> Optional[str]:
    """Generate pixel art image for a gist. Returns image URL or None."""
    image_prompt = gist["gist"].get("image_prompt", "")
    if not image_prompt:
        print("  FATAL: No image prompt in gist")
        return None

    print(f"  Image prompt: {image_prompt[:100]}...")

    image_bytes, _ = generate_image(image_prompt, pollinations_token)
    if not image_bytes:
        print("  FATAL: Image generation failed")
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
    files_summary, changed_files = fetch_pr_files(repo_full_name, pr_number, github_token)

    # ── Step 1: AI analysis → gist JSON → commit ────────────────────
    ai_analysis = analyze_pr(pr_data, files_summary, pollinations_token)
    if not ai_analysis:
        print(f"  FATAL: PR analysis failed with model {MODEL}")
        sys.exit(1)

    gist = build_full_gist(pr_data, ai_analysis, changed_files)

    errors = validate_gist(gist)
    if errors:
        print(f"  FATAL: Schema validation failed: {errors}")
        sys.exit(1)

    print(f"  Gist ready: publish_tier={gist['gist']['publish_tier']}, "
          f"importance={gist['gist']['importance']}")

    # ── Step 2: Generate image → update gist ─────────────────────────
    print(f"\n[2/2] Generating image...")
    image_url = generate_gist_image(gist, pollinations_token, github_token, owner, repo)
    if not image_url:
        print("  FATAL: Could not generate or commit gist image")
        sys.exit(1)

    gist["image"]["url"] = image_url
    gist["image"]["prompt"] = gist["gist"].get("image_prompt")

    if not commit_gist(gist, github_token, owner, repo):
        print("  FATAL: Could not commit gist to news branch")
        sys.exit(1)

    print(f"  Gist committed: publish_tier={gist['gist']['publish_tier']}, "
          f"importance={gist['gist']['importance']}")
    print(f"  Image URL: {image_url}")

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
