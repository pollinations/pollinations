import os
import sys
import json
import time
import random
import re
import base64
import requests
from datetime import datetime, timezone

GITHUB_API_BASE = "https://api.github.com"
POLLINATIONS_API_BASE = "https://enter.pollinations.ai/api/generate/openai"
MODEL = "gemini-large"
NEWS_FOLDER = "NEWS"
NEWSLIST_PATH = "pollinations.ai/src/config/newsList.js"


def get_env(key: str, required: bool = True) -> str:
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def get_latest_news_file(github_token: str, owner: str, repo: str) -> tuple[str, str]:
    """
    Find the latest NEWS file based on today's date using regex pattern matching.
    Returns (file_path, content) or (None, None) if not found.
    """
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    # Get list of files in NEWS folder
    response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{NEWS_FOLDER}",
        headers=headers
    )

    if response.status_code != 200:
        print(f"Error fetching NEWS folder: {response.status_code}")
        return None, None

    files = response.json()

    # Date pattern: YYYY-MM-DD.md
    date_pattern = re.compile(r'^(\d{4}-\d{2}-\d{2})\.md$')

    today = datetime.now(timezone.utc).date()

    # Find files matching the date pattern and parse dates
    dated_files = []
    for f in files:
        if f['type'] != 'file':
            continue
        match = date_pattern.match(f['name'])
        if match:
            try:
                file_date = datetime.strptime(match.group(1), '%Y-%m-%d').date()
                dated_files.append((file_date, f['name'], f['path']))
            except ValueError:
                continue

    if not dated_files:
        print("No dated NEWS files found")
        return None, None

    # Sort by date descending and find the most recent one <= today
    dated_files.sort(key=lambda x: x[0], reverse=True)

    # First, try to find today's file
    for file_date, name, path in dated_files:
        if file_date == today:
            print(f"Found today's NEWS file: {name}")
            break
    else:
        # If no file for today, get the most recent one
        file_date, name, path = dated_files[0]
        print(f"No NEWS file for today ({today}), using most recent: {name} ({file_date})")

    # Fetch the content
    content_response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}",
        headers=headers
    )

    if content_response.status_code != 200:
        print(f"Error fetching file content: {content_response.status_code}")
        return None, None

    content = base64.b64decode(content_response.json()['content']).decode('utf-8')
    return path, content


def get_current_newslist(github_token: str, owner: str, repo: str) -> str:
    """Fetch current newsList.js content from the repo"""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{NEWSLIST_PATH}",
        headers=headers
    )

    if response.status_code == 200:
        content = response.json().get("content", "")
        return base64.b64decode(content).decode("utf-8")
    else:
        print(f"Warning: Could not fetch current newsList.js: {response.status_code}")
        return ""


def create_newslist_prompt(news_content: str, current_newslist: str) -> tuple:
    """Create prompt to generate updated newsList.js with only major updates"""

    system_prompt = """You are updating the newsList.js file for the Pollinations website.

This file displays ONLY major, user-facing updates that website visitors care about. This is NOT a complete changelog - it's a curated highlights list.

INCLUDE only:
- New models or model upgrades (e.g., "Seedream upgraded to 4.5")
- New features users can use (e.g., "New Auth Dashboard")
- New integrations (e.g., "Sequa AI Integration")
- New API endpoints or capabilities
- New tools (e.g., "MCP Server now supports audio")

EXCLUDE:
- Bug fixes
- Internal refactors
- Dependency updates
- CI/CD changes
- Documentation-only changes
- Performance improvements (unless dramatic)
- Code cleanup

OUTPUT FORMAT - You must output ONLY valid JavaScript that exports a newsList constant:
```javascript
export const newsList = `- **YYYY-MM-DD** – **Feature Name** Brief description. Use \`backticks\` for code/endpoints. [Link text](url) if relevant.
- **YYYY-MM-DD** – **Another Feature** Description here.`;
```

RULES:
1. Each entry starts with date in **YYYY-MM-DD** format
2. Feature name in **bold** after the date
3. Use en-dash (–) as separator, not hyphen
4. Use \`backticks\` for code, endpoints, parameters
5. Keep entries concise (1-2 lines max)
6. Most recent entries at the TOP
7. Keep ~15-20 most relevant entries total (drop old minor ones if needed)
8. Output ONLY the JavaScript code, no explanations"""

    user_prompt = f"""Here is this week's NEWS changelog (contains ALL changes):

{news_content}

Here is the CURRENT newsList.js content:

{current_newslist}

Generate the updated newsList.js file. Add any NEW major user-facing features from this week's changelog at the TOP. Keep existing important entries. Remove outdated or minor entries if the list gets too long (aim for ~15-20 entries).

Output ONLY the valid JavaScript export statement."""

    return system_prompt, user_prompt


def call_pollinations_api(system_prompt: str, user_prompt: str, token: str, max_retries: int = 3) -> str:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    last_error = None
    for attempt in range(max_retries):
        seed = random.randint(0, 2147483647)

        payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.3,
            "seed": seed
        }

        if attempt > 0:
            print(f"Retry {attempt}/{max_retries - 1} with new seed: {seed}")

        try:
            response = requests.post(
                POLLINATIONS_API_BASE,
                headers=headers,
                json=payload
            )

            if response.status_code == 200:
                try:
                    result = response.json()
                    return result['choices'][0]['message']['content']
                except (KeyError, IndexError, json.JSONDecodeError) as e:
                    last_error = f"Error parsing API response: {e}"
                    error_preview = response.text[:500] + "..." if len(response.text) > 500 else response.text
                    print(f"{last_error}")
                    print(f"Response preview: {error_preview}")
            else:
                last_error = f"API error: {response.status_code}"
                error_preview = response.text[:500] + "..." if len(response.text) > 500 else response.text
                print(f"{last_error}")
                print(f"Error preview: {error_preview}")

        except requests.exceptions.RequestException as e:
            last_error = f"Request failed: {e}"
            print(last_error)

        if attempt < max_retries - 1:
            print("Waiting 5 seconds before retry...")
            time.sleep(5)

    print(f"All {max_retries} attempts failed. Last error: {last_error}")
    sys.exit(1)


def parse_response(response: str) -> str:
    message = response.strip()

    if message.startswith('```'):
        lines = message.split('\n')
        if lines[0].strip() == '```' or lines[0].startswith('```'):
            lines = lines[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        message = '\n'.join(lines)

    return message.strip()


def generate_newslist_content(news_content: str, current_newslist: str, pollinations_token: str) -> str:
    """Generate updated newsList.js content using AI"""
    print("Generating newsList.js content...")

    system_prompt, user_prompt = create_newslist_prompt(news_content, current_newslist)
    ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)

    content = parse_response(ai_response)

    # Ensure it starts with export const newsList
    if not content.strip().startswith("export const newsList"):
        # Try to extract just the export statement
        if "export const newsList" in content:
            start = content.index("export const newsList")
            content = content[start:]

    # Ensure it ends with semicolon
    content = content.strip()
    if not content.endswith(";"):
        content += ";"

    # Add newline at end of file
    content += "\n"

    return content


def get_file_sha(github_token: str, owner: str, repo: str, file_path: str, branch: str = "main") -> str:
    """Get the SHA of an existing file (needed for updates)"""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{file_path}?ref={branch}",
        headers=headers
    )

    if response.status_code == 200:
        return response.json().get("sha", "")
    return ""


def create_newslist_pr(newslist_content: str, github_token: str, owner: str, repo: str, news_file_path: str):
    """Create a PR with updated newsList.js"""

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
    branch_name = f"newslist-update-{entry_date}"
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

    # Update newsList.js
    newslist_sha = get_file_sha(github_token, owner, repo, NEWSLIST_PATH, branch_name)
    if not newslist_sha:
        newslist_sha = get_file_sha(github_token, owner, repo, NEWSLIST_PATH, "main")

    newslist_api_path = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{NEWSLIST_PATH}"
    newslist_encoded = base64.b64encode(newslist_content.encode()).decode()

    newslist_payload = {
        "message": f"docs: update website news highlights - {entry_date}",
        "content": newslist_encoded,
        "branch": branch_name
    }

    if newslist_sha:
        newslist_payload["sha"] = newslist_sha

    newslist_response = requests.put(newslist_api_path, headers=headers, json=newslist_payload)

    if newslist_response.status_code not in [200, 201]:
        print(f"Error updating newsList.js: {newslist_response.text}")
        sys.exit(1)

    print(f"Updated {NEWSLIST_PATH} on branch {branch_name}")

    # Create PR
    pr_title = f"Update Website News Highlights - {entry_date}"
    pr_body = f"""## Website News Highlights Update

This PR updates `{NEWSLIST_PATH}` with curated highlights from the latest NEWS entry.

**Source:** `{news_file_path}`

---
Generated automatically by GitHub Actions after NEWS PR merge.
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


def main():
    github_token = get_env('GITHUB_TOKEN')
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    repo_full_name = get_env('GITHUB_REPOSITORY')
    owner_name, repo_name = repo_full_name.split('/')

    # Find the latest NEWS file based on today's date
    print("Looking for latest NEWS file...")
    news_file_path, news_content = get_latest_news_file(github_token, owner_name, repo_name)

    if not news_file_path or not news_content:
        print("Could not find a valid NEWS file. Exiting.")
        sys.exit(1)

    print(f"Using NEWS file: {news_file_path}")

    # Fetch current newsList.js
    print("Fetching current newsList.js...")
    current_newslist = get_current_newslist(github_token, owner_name, repo_name)

    # Generate updated newsList.js content
    newslist_content = generate_newslist_content(news_content, current_newslist, pollinations_token)

    if not newslist_content.strip():
        print("Empty newsList.js response from AI. Exiting.")
        sys.exit(1)

    print("newsList.js content generated")

    # Create PR with updated newsList.js
    create_newslist_pr(newslist_content, github_token, owner_name, repo_name, news_file_path)
    print("newsList.js update completed!")


if __name__ == "__main__":
    main()
