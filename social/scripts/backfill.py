#!/usr/bin/env python3
"""
Backfill script for the social news pipeline.

Generates Tier 1 gists (per-PR analysis + pixel art) for a date range
of already-merged PRs. Commits to a branch and creates a PR (since
branch protection prevents direct commits to main).

Usage:
    # Tier 1 (gists + images) — creates a PR with all gists
    python backfill.py --tier1

    # Custom date range (default: last 7 days)
    python backfill.py --tier1 --since 2026-02-08 --until 2026-02-11

    # Dry run — show what would be processed
    python backfill.py --tier1 --dry-run

    # Skip image generation (faster, for testing)
    python backfill.py --tier1 --skip-images

    # Process a single PR
    python backfill.py --tier1 --pr 8117

    # Tier 2 (daily summaries) — after gists are on main
    python backfill.py --tier2

Environment variables:
    GITHUB_TOKEN        — GitHub PAT (auto-detected from `gh auth token`)
    POLLINATIONS_TOKEN  — Pollinations API key for AI + image gen
"""

import os
import sys
import json
import base64
import subprocess
import argparse
import time
from datetime import datetime, timezone, timedelta

# Add scripts dir to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import (
    get_repo_root,
    github_api_request,
    get_file_sha,
    GITHUB_API_BASE,
    OWNER,
    REPO,
)

# Labels that indicate bot/automated PRs to skip
BOT_LABELS = {"NEWS"}
BOT_AUTHORS = {"github-actions[bot]", "dependabot[bot]", "pollinations-ai[bot]"}


def get_github_token():
    """Get GitHub token from env or gh CLI."""
    token = os.getenv("GITHUB_TOKEN")
    if token:
        return token
    try:
        result = subprocess.run(
            ["gh", "auth", "token"], capture_output=True, text=True, check=True
        )
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("Error: No GITHUB_TOKEN and `gh auth token` failed.")
        sys.exit(1)


def fetch_merged_prs(token, since, until):
    """Fetch merged PRs in the date range using GitHub search API."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }

    all_prs = []
    page = 1

    while True:
        query = f"repo:{OWNER}/{REPO} is:pr is:merged merged:{since}..{until}"
        resp = github_api_request(
            "GET",
            f"{GITHUB_API_BASE}/search/issues",
            headers=headers,
            params={"q": query, "per_page": 100, "page": page, "sort": "created", "order": "asc"},
        )

        if resp.status_code != 200:
            print(f"Search API error: {resp.status_code} {resp.text[:300]}")
            break

        data = resp.json()
        items = data.get("items", [])
        if not items:
            break

        for item in items:
            all_prs.append({
                "number": item["number"],
                "title": item["title"],
                "author": item.get("user", {}).get("login", "unknown"),
                "labels": [l["name"] for l in item.get("labels", [])],
                "html_url": item["html_url"],
            })

        if len(items) < 100:
            break
        page += 1

    return all_prs


def fetch_pr_detail(token, pr_number):
    """Fetch full PR data (needed for merged_at, body, etc)."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }
    resp = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{OWNER}/{REPO}/pulls/{pr_number}",
        headers=headers,
    )
    if resp.status_code != 200:
        return None
    return resp.json()


def should_skip_pr(pr):
    """Check if a PR should be skipped (bot/automated)."""
    labels = set(pr.get("labels", []))
    author = pr.get("author", "")

    if labels & BOT_LABELS:
        return True
    if author in BOT_AUTHORS:
        return True
    return False


def commit_file_to_branch(content_bytes, file_path, branch, github_token, message=None):
    """Commit a file to a branch via GitHub Contents API. Returns True on success."""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
    }

    encoded = base64.b64encode(content_bytes).decode()
    sha = get_file_sha(github_token, OWNER, REPO, file_path, branch)
    if not sha:
        sha = get_file_sha(github_token, OWNER, REPO, file_path, "main")

    payload = {
        "message": message or f"add {file_path.split('/')[-1]}",
        "content": encoded,
        "branch": branch,
    }
    if sha:
        payload["sha"] = sha

    resp = github_api_request(
        "PUT",
        f"{GITHUB_API_BASE}/repos/{OWNER}/{REPO}/contents/{file_path}",
        headers=headers,
        json=payload,
    )

    if resp.status_code in [200, 201]:
        return True

    print(f"  Failed to commit {file_path}: {resp.status_code} {resp.text[:200]}")
    return False


def create_backfill_branch(github_token, branch_name):
    """Create a branch from main HEAD. Returns True if created or already exists."""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
    }

    # Get main HEAD
    ref_resp = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{OWNER}/{REPO}/git/ref/heads/main",
        headers=headers,
    )
    if ref_resp.status_code != 200:
        print(f"Error getting main ref: {ref_resp.text[:200]}")
        return False

    base_sha = ref_resp.json()["object"]["sha"]

    create_resp = github_api_request(
        "POST",
        f"{GITHUB_API_BASE}/repos/{OWNER}/{REPO}/git/refs",
        headers=headers,
        json={"ref": f"refs/heads/{branch_name}", "sha": base_sha},
    )

    if create_resp.status_code in [200, 201]:
        print(f"Created branch: {branch_name}")
        return True

    if "Reference already exists" in create_resp.text:
        print(f"Branch {branch_name} already exists — will append to it")
        return True

    print(f"Error creating branch: {create_resp.text[:200]}")
    return False


def create_backfill_pr(github_token, branch_name, since, until, pr_count):
    """Create a PR for the backfill branch."""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
    }

    pr_resp = github_api_request(
        "POST",
        f"{GITHUB_API_BASE}/repos/{OWNER}/{REPO}/pulls",
        headers=headers,
        json={
            "title": f"chore(news): backfill {pr_count} PR gists ({since} to {until})",
            "body": f"## Backfill PR Gists\n\n"
                    f"- **Date range:** {since} → {until}\n"
                    f"- **PRs processed:** {pr_count}\n"
                    f"- Each PR has an AI-generated gist JSON + pixel art image\n"
                    f"- These gists populate `social/news/gists/` for the 3-tier pipeline\n\n"
                    f"Generated by `social/scripts/backfill.py`.",
            "head": branch_name,
            "base": "main",
        },
    )

    if pr_resp.status_code in [200, 201]:
        pr_info = pr_resp.json()
        print(f"Created PR #{pr_info['number']}: {pr_info['html_url']}")
        return pr_info["number"]

    if "A pull request already exists" in pr_resp.text:
        print("PR already exists for this branch")
        return None

    print(f"Error creating PR: {pr_resp.text[:200]}")
    return None


def run_tier1(prs, github_token, pollinations_token, since, until, skip_images=False, dry_run=False):
    """Run Tier 1 gist generation for each PR, committing to a branch."""
    from generate_realtime import fetch_pr_data, fetch_pr_files, analyze_pr, build_full_gist
    from common import (
        build_minimal_gist, validate_gist, generate_image, gist_path_for_pr,
    )

    total = len(prs)
    succeeded = 0
    failed = 0

    if dry_run:
        for i, pr in enumerate(prs, 1):
            print(f"  [{i}/{total}] #{pr['number']}: {pr['title']} ({pr['author']})")
        print(f"\n  {total} PRs would be processed")
        return

    # Create branch
    branch_name = f"backfill/gists-{since}-to-{until}"
    if not create_backfill_branch(github_token, branch_name):
        print("Failed to create branch — aborting")
        return

    for i, pr in enumerate(prs, 1):
        pr_num = pr["number"]
        print(f"\n{'='*60}")
        print(f"[{i}/{total}] PR #{pr_num}: {pr['title']}")
        print(f"  Author: {pr['author']} | Labels: {pr['labels']}")
        print(f"{'='*60}")

        repo_full = f"{OWNER}/{REPO}"

        # Fetch full PR data
        pr_data = fetch_pr_data(repo_full, str(pr_num), github_token)
        files_summary = fetch_pr_files(repo_full, str(pr_num), github_token)

        labels = [l["name"] for l in pr_data.get("labels", [])]
        merged_at = pr_data.get("merged_at", datetime.now(timezone.utc).isoformat())
        author = pr_data.get("user", {}).get("login", "unknown")

        # AI analysis
        print("  Analyzing with AI...")
        ai_analysis = analyze_pr(pr_data, files_summary, pollinations_token)

        if ai_analysis:
            gist = build_full_gist(pr_data, ai_analysis)
            errors = validate_gist(gist)
            if errors:
                print(f"  Validation warnings: {errors}")
                gist = build_minimal_gist(pr_num, pr_data["title"], author, pr_data["html_url"], merged_at, labels)
        else:
            print("  AI failed — using minimal gist")
            gist = build_minimal_gist(pr_num, pr_data["title"], author, pr_data["html_url"], merged_at, labels)

        # Commit gist JSON to branch
        gist_file_path = gist_path_for_pr(gist["pr_number"], gist["merged_at"])
        gist_json = json.dumps(gist, indent=2, ensure_ascii=False)

        if not commit_file_to_branch(
            gist_json.encode(), gist_file_path, branch_name, github_token,
            message=f"chore(news): add gist for PR #{pr_num}",
        ):
            print(f"  FAILED to commit gist for PR #{pr_num}")
            failed += 1
            continue

        print(f"  Gist: tier={gist['gist']['publish_tier']}, importance={gist['gist']['importance']}")

        # Image generation
        if not skip_images and gist["gist"].get("image_prompt"):
            print("  Generating pixel art...")
            image_prompt = gist["gist"]["image_prompt"]
            image_bytes, _ = generate_image(image_prompt, pollinations_token)

            if image_bytes:
                date_str = gist["merged_at"][:10]
                image_path = f"social/news/gists/{date_str}/PR-{pr_num}.jpg"
                if commit_file_to_branch(
                    image_bytes, image_path, branch_name, github_token,
                    message=f"add image for PR #{pr_num}",
                ):
                    image_url = f"https://raw.githubusercontent.com/{OWNER}/{REPO}/main/{image_path}"
                    gist["image"]["url"] = image_url
                    gist["image"]["prompt"] = image_prompt
                    # Re-commit gist with image URL
                    gist_json = json.dumps(gist, indent=2, ensure_ascii=False)
                    commit_file_to_branch(
                        gist_json.encode(), gist_file_path, branch_name, github_token,
                        message=f"update gist #{pr_num} with image URL",
                    )
                    print(f"  Image committed: {image_path}")
                else:
                    print("  Failed to commit image")
            else:
                print("  Image generation failed — gist saved without image")

            # Small delay between PRs to avoid rate limits
            time.sleep(2)
        elif skip_images:
            print("  [SKIP] Image generation skipped")

        succeeded += 1

    print(f"\n{'='*60}")
    print(f"Tier 1 complete: {succeeded}/{total} succeeded, {failed} failed")
    print(f"{'='*60}")

    # Create PR
    if succeeded > 0:
        print("\nCreating PR...")
        create_backfill_pr(github_token, branch_name, since, until, succeeded)


def run_tier2(dates, github_token, pollinations_token, dry_run=False):
    """Run Tier 2 daily summary generation for each date."""
    os.environ["GITHUB_TOKEN"] = github_token
    os.environ["POLLINATIONS_TOKEN"] = pollinations_token
    os.environ["GITHUB_REPOSITORY"] = f"{OWNER}/{REPO}"

    from generate_daily import (
        filter_daily_gists, generate_summary,
        generate_twitter_post, generate_instagram_post, generate_reddit_post,
        generate_diary, create_daily_pr,
    )
    from common import read_gists_for_date
    import requests

    for date_str in sorted(dates):
        print(f"\n{'='*60}")
        print(f"Tier 2: Daily summary for {date_str}")
        print(f"{'='*60}")

        if dry_run:
            print("  [DRY RUN] Would generate daily summary + platform posts + PR")
            continue

        # Read gists — try local first, then API fallback
        gists = read_gists_for_date(date_str)

        if not gists:
            print("  No local gists found, fetching from GitHub API...")
            headers = {
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {github_token}",
            }
            gists_dir = f"social/news/gists/{date_str}"
            resp = requests.get(
                f"{GITHUB_API_BASE}/repos/{OWNER}/{REPO}/contents/{gists_dir}",
                headers=headers,
            )
            if resp.status_code == 200:
                for file_info in resp.json():
                    if file_info["name"].startswith("PR-") and file_info["name"].endswith(".json"):
                        content_resp = requests.get(file_info["url"], headers=headers)
                        if content_resp.status_code == 200:
                            content = base64.b64decode(content_resp.json()["content"]).decode()
                            try:
                                gists.append(json.loads(content))
                            except json.JSONDecodeError:
                                pass

        if not gists:
            print(f"  No gists for {date_str} — skipping")
            continue

        daily_gists = filter_daily_gists(gists)
        print(f"  {len(gists)} gists total, {len(daily_gists)} daily-tier")

        if not daily_gists:
            print("  No daily-tier gists — skipping")
            continue

        print("  Generating summary...")
        summary = generate_summary(daily_gists, date_str, pollinations_token)
        if not summary:
            print(f"  Summary generation FAILED for {date_str}")
            continue

        arcs = summary.get("arcs", [])
        print(f"  {len(arcs)} arcs: {summary.get('one_liner', '')}")

        print("  Generating platform posts...")
        twitter_post = generate_twitter_post(summary, pollinations_token)
        instagram_post = generate_instagram_post(summary, pollinations_token)
        reddit_post = generate_reddit_post(summary, pollinations_token)

        print("  Generating diary...")
        diary = generate_diary(daily_gists, date_str, pollinations_token)

        print("  Creating PR...")
        os.environ["TARGET_DATE"] = date_str
        pr_number = create_daily_pr(
            date_str, summary,
            twitter_post, instagram_post, diary,
            github_token, OWNER, REPO,
            reddit_post=reddit_post,
        )

        if pr_number:
            print(f"  PR #{pr_number} created for {date_str}")
        else:
            print(f"  Failed to create PR for {date_str}")


def main():
    parser = argparse.ArgumentParser(description="Backfill social news pipeline data")
    parser.add_argument("--tier1", action="store_true", help="Run Tier 1 (per-PR gists + images)")
    parser.add_argument("--tier2", action="store_true", help="Run Tier 2 (daily summaries + PRs)")
    parser.add_argument("--since", help="Start date YYYY-MM-DD (default: 7 days ago)")
    parser.add_argument("--until", help="End date YYYY-MM-DD (default: today)")
    parser.add_argument("--pr", type=int, help="Process a single PR number")
    parser.add_argument("--skip-images", action="store_true", help="Skip image generation")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be processed")
    args = parser.parse_args()

    if not args.tier1 and not args.tier2:
        parser.error("Specify at least one of --tier1 or --tier2")

    # Tokens
    github_token = get_github_token()
    pollinations_token = os.getenv("POLLINATIONS_TOKEN")
    if not pollinations_token:
        print("Error: POLLINATIONS_TOKEN environment variable required")
        sys.exit(1)

    # Date range
    if args.since:
        since = args.since
    else:
        since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    if args.until:
        until = args.until
    else:
        until = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    print(f"Backfill: {since} → {until}")

    # Fetch PRs
    if args.pr:
        pr_detail = fetch_pr_detail(github_token, args.pr)
        if not pr_detail:
            print(f"PR #{args.pr} not found")
            sys.exit(1)
        prs = [{
            "number": pr_detail["number"],
            "title": pr_detail["title"],
            "author": pr_detail.get("user", {}).get("login", "unknown"),
            "labels": [l["name"] for l in pr_detail.get("labels", [])],
            "html_url": pr_detail["html_url"],
            "merged_at": pr_detail.get("merged_at"),
        }]
    else:
        print("Fetching merged PRs...")
        prs = fetch_merged_prs(github_token, since, until)

    # Filter out bot PRs
    real_prs = [pr for pr in prs if not should_skip_pr(pr)]
    skipped = len(prs) - len(real_prs)

    print(f"Found {len(prs)} PRs total, {len(real_prs)} real ({skipped} bot/NEWS skipped)")

    if not real_prs:
        print("Nothing to backfill!")
        return

    # Fetch merged_at for date grouping
    dates = set()
    for pr in real_prs:
        if "merged_at" not in pr or not pr.get("merged_at"):
            detail = fetch_pr_detail(github_token, pr["number"])
            if detail:
                pr["merged_at"] = detail.get("merged_at")
        if pr.get("merged_at"):
            dates.add(pr["merged_at"][:10])

    print(f"Dates covered: {sorted(dates)}")
    print(f"\nPRs to process:")
    for pr in real_prs:
        date = pr.get("merged_at", "?")[:10] if pr.get("merged_at") else "?"
        print(f"  [{date}] #{pr['number']}: {pr['title']} ({pr['author']})")

    # Tier 1
    if args.tier1:
        print(f"\n{'#'*60}")
        print(f"# TIER 1: Generating gists for {len(real_prs)} PRs")
        print(f"{'#'*60}")
        run_tier1(real_prs, github_token, pollinations_token, since, until,
                  skip_images=args.skip_images, dry_run=args.dry_run)

    # Tier 2
    if args.tier2:
        print(f"\n{'#'*60}")
        print(f"# TIER 2: Generating daily summaries for {len(dates)} dates")
        print(f"{'#'*60}")
        run_tier2(dates, github_token, pollinations_token, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
