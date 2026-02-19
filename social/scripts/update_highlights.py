#!/usr/bin/env python3
"""
Highlights + README Update

Reads yesterday's PR gists, AI-curates highlights, and creates a single PR
updating both highlights.md and README.md "Latest News" section.

Triggered daily at 06:00 UTC by NEWS_highlights_update.yml.
"""

import os
import sys
import base64
from datetime import datetime, timezone, timedelta
from common import (
    load_prompt,
    get_env,
    get_file_sha,
    get_repo_root,
    call_pollinations_api,
    read_gists_for_date,
    read_news_text_file,
    github_api_request,
    GITHUB_API_BASE,
    OWNER,
    REPO,
)
from update_readme import get_top_highlights, update_readme_news_section

HIGHLIGHTS_PATH = "social/news/highlights.md"
README_PATH = "README.md"


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


def parse_response(response: str) -> str:
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


def generate_highlights_and_readme(pollinations_token: str, date_str: str) -> tuple[str | None, str | None]:
    """Generate updated highlights.md and README.md content without creating a PR.

    Reads gists for the given date, AI-curates highlights, merges with existing
    highlights.md, and updates the README "Latest News" section.

    Returns (highlights_content, readme_content). Either may be None if no updates.
    """
    # Load gists and format as changelog
    changelog, gist_count = load_gists_as_changelog(date_str)
    if not changelog:
        print(f"  Highlights: no qualifying gists for {date_str}")
        return None, None
    print(f"  Highlights: {gist_count} qualifying gists for {date_str}")

    # Generate highlights via AI
    system_prompt, user_prompt = create_highlights_prompt(changelog, date_str)
    ai_response = call_pollinations_api(
        system_prompt, user_prompt, pollinations_token,
        temperature=0.3, exit_on_failure=False,
    )
    if not ai_response:
        print("  Highlights: AI generation failed")
        return None, None

    new_highlights = parse_response(ai_response)
    if not new_highlights.strip():
        print("  Highlights: empty response from AI")
        return None, None

    print(f"  Highlights: generated new entries")

    # Merge with existing highlights (local overlay first, API fallback)
    repo_root = get_repo_root()
    highlights_path = os.path.join(repo_root, HIGHLIGHTS_PATH)
    existing_highlights = ""
    if os.path.exists(highlights_path):
        with open(highlights_path, "r") as f:
            existing_highlights = f.read()
    else:
        # Fallback: fetch from news branch via GitHub API
        github_token = get_env("GITHUB_TOKEN", required=False)
        if github_token:
            fetched = read_news_text_file(HIGHLIGHTS_PATH, github_token, OWNER, REPO)
            if fetched:
                existing_highlights = fetched
                print("  Highlights: fetched existing from news branch via API")
    merged_highlights = merge_highlights(new_highlights, existing_highlights)

    # Update README (read locally)
    readme_path = os.path.join(repo_root, README_PATH)
    updated_readme = None
    if os.path.exists(readme_path):
        with open(readme_path, "r") as f:
            readme_content = f.read()
        top_entries = get_top_highlights(merged_highlights)
        if top_entries:
            result = update_readme_news_section(readme_content, top_entries)
            if result and result != readme_content:
                updated_readme = result
                print("  Highlights: README will be updated")

    return merged_highlights, updated_readme


def create_highlights_pr(
    highlights_content: str,
    readme_content: str | None,
    new_highlights: str,
    github_token: str,
    owner: str,
    repo: str,
    date_str: str,
):
    """Create a PR with updated highlights.md and README.md."""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
    }

    # Get latest commit SHA from main
    ref_response = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/ref/heads/main",
        headers=headers,
    )
    if ref_response.status_code != 200:
        print(f"Error getting ref: {ref_response.text}")
        sys.exit(1)
    base_sha = ref_response.json()["object"]["sha"]

    # Create branch
    branch_name = f"highlights-update-{date_str}"
    create_branch_response = github_api_request(
        "POST",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/refs",
        headers=headers,
        json={"ref": f"refs/heads/{branch_name}", "sha": base_sha},
    )

    if create_branch_response.status_code not in [200, 201]:
        if "Reference already exists" in create_branch_response.text:
            print(f"Branch {branch_name} already exists, updating...")
        else:
            print(f"Error creating branch: {create_branch_response.text}")
            sys.exit(1)

    print(f"Created branch: {branch_name}")

    # Commit highlights.md
    highlights_sha = get_file_sha(github_token, owner, repo, HIGHLIGHTS_PATH, branch_name)
    if not highlights_sha:
        highlights_sha = get_file_sha(github_token, owner, repo, HIGHLIGHTS_PATH, "main")

    highlights_payload = {
        "message": f"docs: update highlights — {date_str}",
        "content": base64.b64encode(highlights_content.encode()).decode(),
        "branch": branch_name,
    }
    if highlights_sha:
        highlights_payload["sha"] = highlights_sha

    resp = github_api_request(
        "PUT",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{HIGHLIGHTS_PATH}",
        headers=headers,
        json=highlights_payload,
    )
    if resp.status_code not in [200, 201]:
        print(f"Error updating highlights.md: {resp.text}")
        sys.exit(1)
    print(f"Updated {HIGHLIGHTS_PATH} on branch {branch_name}")

    # Commit README.md (if changed)
    if readme_content:
        readme_sha = get_file_sha(github_token, owner, repo, README_PATH, branch_name)
        if not readme_sha:
            readme_sha = get_file_sha(github_token, owner, repo, README_PATH, "main")

        readme_payload = {
            "message": f"docs: update README latest news — {date_str}",
            "content": base64.b64encode(readme_content.encode()).decode(),
            "branch": branch_name,
        }
        if readme_sha:
            readme_payload["sha"] = readme_sha

        resp = github_api_request(
            "PUT",
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{README_PATH}",
            headers=headers,
            json=readme_payload,
        )
        if resp.status_code not in [200, 201]:
            print(f"Warning: Failed to update README.md: {resp.text[:200]}")
        else:
            print(f"Updated {README_PATH} on branch {branch_name}")

    # Count new highlights for PR title
    new_count = len([line for line in new_highlights.split("\n") if line.strip().startswith("- **")])

    # Create PR
    pr_title = f"✨ Highlights Update — {date_str} ({new_count} new)"
    pr_body = f"""## New Highlights

{new_highlights}

---

**Source:** gists from `social/news/gists/{date_str}/`

Generated automatically by NEWS_highlights_update workflow.
"""

    pr_response = github_api_request(
        "POST",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls",
        headers=headers,
        json={
            "title": pr_title,
            "body": pr_body,
            "head": branch_name,
            "base": "main",
        },
    )

    if pr_response.status_code not in [200, 201]:
        if "A pull request already exists" in pr_response.text:
            print("PR already exists for this branch")
            return
        print(f"Error creating PR: {pr_response.text}")
        sys.exit(1)

    pr_data = pr_response.json()
    pr_number = pr_data["number"]
    print(f"Created PR #{pr_number}: {pr_data['html_url']}")

    # Write PR number for workflow auto-merge step
    with open(".pr_number", "w") as f:
        f.write(str(pr_number))

    # Add labels
    pr_labels = get_env("PR_LABELS", required=False)
    if pr_labels:
        labels_list = [label.strip() for label in pr_labels.split(",")]
        label_response = github_api_request(
            "POST",
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/issues/{pr_number}/labels",
            headers=headers,
            json={"labels": labels_list},
        )
        if label_response.status_code in [200, 201]:
            print(f"Added labels {labels_list} to PR #{pr_number}")
        else:
            print(f"Warning: Could not add labels: {label_response.status_code}")


def main():
    """Standalone mode: generate highlights + README and create a dedicated PR."""
    github_token = get_env("GITHUB_TOKEN")
    pollinations_token = get_env("POLLINATIONS_TOKEN")
    repo_full_name = get_env("GITHUB_REPOSITORY")
    owner, repo = repo_full_name.split("/")

    date_str = get_env("TARGET_DATE", required=False)
    if not date_str:
        date_str = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    print(f"=== Highlights Update for {date_str} ===")

    highlights_content, readme_content = generate_highlights_and_readme(pollinations_token, date_str)

    if highlights_content is None:
        print("No highlights to update. Exiting cleanly.")
        return

    # Extract new_highlights text for PR body (everything before existing content)
    repo_root = get_repo_root()
    highlights_path = os.path.join(repo_root, HIGHLIGHTS_PATH)
    existing = ""
    if os.path.exists(highlights_path):
        with open(highlights_path, "r") as f:
            existing = f.read().strip()
    new_highlights = highlights_content.replace(existing, "").strip() if existing else highlights_content.strip()

    create_highlights_pr(
        highlights_content, readme_content, new_highlights,
        github_token, owner, repo, date_str,
    )
    print("Highlights update completed!")


if __name__ == "__main__":
    main()
