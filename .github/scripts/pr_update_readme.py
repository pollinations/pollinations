import os
import sys
import re
import base64
import requests
from datetime import datetime, timezone

GITHUB_API_BASE = "https://api.github.com"
HIGHLIGHTS_PATH = "social/news/transformed/highlights.md"
README_PATH = "README.md"
MAX_README_ENTRIES = 10


def get_env(key: str, required: bool = True) -> str:
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def get_file_content(github_token: str, owner: str, repo: str, file_path: str) -> tuple[str, str]:
    """Fetch file content and SHA from the repo"""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{file_path}",
        headers=headers
    )

    if response.status_code == 200:
        data = response.json()
        content = base64.b64decode(data.get("content", "")).decode("utf-8")
        sha = data.get("sha", "")
        return content, sha
    else:
        print(f"Error fetching {file_path}: {response.status_code}")
        return None, None


def get_top_highlights(highlights_content: str, count: int = MAX_README_ENTRIES) -> list[str]:
    """Extract top N highlight entries from highlights.md"""
    lines = highlights_content.strip().split('\n')
    entries = []

    for line in lines:
        line = line.strip()
        if line.startswith('- **'):
            entries.append(line)
            if len(entries) >= count:
                break

    return entries


def update_readme_news_section(readme_content: str, new_entries: list[str]) -> str:
    """Update the '## 🆕 Latest News' section in README with new entries"""

    # Check if section exists
    if '## 🆕 Latest News' not in readme_content:
        print("Warning: '## 🆕 Latest News' section not found in README")
        return None

    # Pattern to find the Latest News section
    # It starts with "## 🆕 Latest News" and ends before "---", next "##" section, or EOF
    pattern = r'(## 🆕 Latest News\s*\n)(.*?)(---|\n## |$)'

    def replacement(match):
        header = match.group(1)
        ending = match.group(3)
        # Build new content with entries
        new_content = '\n'.join(new_entries) + '\n'
        return header + new_content + ending

    # Use re.DOTALL to match across newlines
    updated_readme = re.sub(pattern, replacement, readme_content, flags=re.DOTALL)

    return updated_readme


def create_readme_pr(readme_content: str, readme_sha: str, new_entries: list[str], github_token: str, owner: str, repo: str):
    """Create a PR with updated README.md"""

    entry_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    default_branch = "main"

    # Get latest commit SHA
    ref_response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/ref/heads/{default_branch}",
        headers=headers
    )
    if ref_response.status_code != 200:
        print(f"Error getting ref: {ref_response.text}")
        sys.exit(1)
    base_sha = ref_response.json()['object']['sha']

    # Create new branch
    branch_name = f"readme-news-update-{entry_date}"
    create_branch_response = requests.post(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/refs",
        headers=headers,
        json={
            "ref": f"refs/heads/{branch_name}",
            "sha": base_sha
        }
    )

    if create_branch_response.status_code not in [200, 201]:
        if "Reference already exists" in create_branch_response.text:
            print(f"Branch {branch_name} already exists, updating...")
        else:
            print(f"Error creating branch: {create_branch_response.text}")
            sys.exit(1)

    print(f"Created branch: {branch_name}")

    # Get README SHA on the new branch (might differ from main)
    readme_sha_branch = readme_sha
    readme_response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{README_PATH}?ref={branch_name}",
        headers=headers
    )
    if readme_response.status_code == 200:
        readme_sha_branch = readme_response.json().get("sha", readme_sha)

    # Update README.md
    readme_api_path = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{README_PATH}"
    readme_encoded = base64.b64encode(readme_content.encode()).decode()

    readme_payload = {
        "message": f"docs: update README latest news - {entry_date}",
        "content": readme_encoded,
        "branch": branch_name,
        "sha": readme_sha_branch
    }

    update_response = requests.put(readme_api_path, headers=headers, json=readme_payload)

    if update_response.status_code not in [200, 201]:
        print(f"Error updating README.md: {update_response.text}")
        sys.exit(1)

    print(f"Updated {README_PATH} on branch {branch_name}")

    # Format entries for PR body
    entries_preview = '\n'.join(new_entries)

    # Create PR
    pr_title = f"📰 Update README Latest News - {entry_date}"
    pr_body = f"""## README Latest News Update

This PR updates the **🆕 Latest News** section in README.md with the top {len(new_entries)} highlights.

### New Content:

{entries_preview}

---

**Source:** `{HIGHLIGHTS_PATH}`

Generated automatically by GitHub Actions after highlights.md PR merge.
"""

    pr_response = requests.post(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls",
        headers=headers,
        json={
            "title": pr_title,
            "body": pr_body,
            "head": branch_name,
            "base": default_branch
        }
    )

    if pr_response.status_code not in [200, 201]:
        if "A pull request already exists" in pr_response.text:
            print("PR already exists for this branch")
            return
        print(f"Error creating PR: {pr_response.text}")
        sys.exit(1)

    pr_data = pr_response.json()
    pr_number = pr_data['number']
    print(f"Created PR #{pr_number}: {pr_data['html_url']}")

    # Add labels from PR_LABELS env var
    pr_labels = get_env('PR_LABELS', required=False)
    if pr_labels:
        labels_list = [label.strip() for label in pr_labels.split(',')]
        label_response = requests.post(
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/issues/{pr_number}/labels",
            headers=headers,
            json={"labels": labels_list}
        )
        if label_response.status_code in [200, 201]:
            print(f"Added labels {labels_list} to PR #{pr_number}")
        else:
            print(f"Warning: Could not add labels: {label_response.status_code}")


def main():
    github_token = get_env('GITHUB_TOKEN')
    repo_full_name = get_env('GITHUB_REPOSITORY')
    owner_name, repo_name = repo_full_name.split('/')

    # Fetch highlights.md
    print(f"Fetching {HIGHLIGHTS_PATH}...")
    highlights_content, _ = get_file_content(github_token, owner_name, repo_name, HIGHLIGHTS_PATH)

    if not highlights_content:
        print("Could not fetch highlights.md. Exiting.")
        sys.exit(1)

    # Get top entries
    top_entries = get_top_highlights(highlights_content, MAX_README_ENTRIES)

    if not top_entries:
        print("No highlight entries found in highlights.md. Exiting.")
        return

    print(f"Found {len(top_entries)} entries for README")

    # Fetch README.md
    print(f"Fetching {README_PATH}...")
    readme_content, readme_sha = get_file_content(github_token, owner_name, repo_name, README_PATH)

    if not readme_content:
        print("Could not fetch README.md. Exiting.")
        sys.exit(1)

    # Update README with new entries
    updated_readme = update_readme_news_section(readme_content, top_entries)

    if not updated_readme:
        print("Failed to update README content. Exiting.")
        sys.exit(1)

    # Check if there are actual changes
    if updated_readme == readme_content:
        print("No changes to README needed. Exiting.")
        return

    # Create PR with updated README
    create_readme_pr(updated_readme, readme_sha, top_entries, github_token, owner_name, repo_name)
    print("README update completed!")


if __name__ == "__main__":
    main()
