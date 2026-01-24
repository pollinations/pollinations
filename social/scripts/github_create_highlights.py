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
POLLINATIONS_API_BASE = "https://gen.pollinations.ai/v1/chat/completions"
MODEL = "gemini-large"
NEWS_FOLDER = "social/news"
HIGHLIGHTS_PATH = "social/news/transformed/highlights.md"

# Prompt paths (relative to repo root)
PROMPTS_DIR = "social/prompts/github"


def get_repo_root() -> str:
    """Get the repository root directory"""
    current = os.path.dirname(os.path.abspath(__file__))
    while current != '/':
        if os.path.exists(os.path.join(current, '.git')):
            return current
        current = os.path.dirname(current)
    return os.getcwd()


def load_prompt(filename: str) -> str:
    """Load a prompt from the social/prompts/github/ directory"""
    repo_root = get_repo_root()
    prompt_path = os.path.join(repo_root, PROMPTS_DIR, filename)
    try:
        with open(prompt_path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        print(f"Error: Prompt file not found: {prompt_path}")
        sys.exit(1)


def get_env(key: str, required: bool = True) -> str:
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def get_latest_news_file(github_token: str, owner: str, repo: str) -> tuple[str, str, str]:
    """
    Find the latest NEWS file based on today's date using regex pattern matching.
    Returns (file_path, content, date_str) or (None, None, None) if not found.
    """
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{NEWS_FOLDER}",
        headers=headers
    )

    if response.status_code != 200:
        print(f"Error fetching NEWS folder: {response.status_code}")
        return None, None, None

    files = response.json()

    # Date pattern: YYYY-MM-DD.md
    date_pattern = re.compile(r'^(\d{4}-\d{2}-\d{2})\.md$')
    today = datetime.now(timezone.utc).date()

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
        return None, None, None

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
        return None, None, None

    content = base64.b64decode(content_response.json()['content']).decode('utf-8')
    date_str = file_date.strftime('%Y-%m-%d')
    return path, content, date_str


def get_current_highlights(github_token: str, owner: str, repo: str) -> str:
    """Fetch current highlights.md content from the repo (if exists)"""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{HIGHLIGHTS_PATH}",
        headers=headers
    )

    if response.status_code == 200:
        content = response.json().get("content", "")
        return base64.b64decode(content).decode("utf-8")
    else:
        print(f"No existing highlights.md found (status: {response.status_code}), will create new")
        return ""


def get_links_file(github_token: str, owner: str, repo: str) -> str:
    """Fetch social/news/LINKS.md containing reference links for highlights"""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{NEWS_FOLDER}/LINKS.md",
        headers=headers
    )

    if response.status_code == 200:
        content = response.json().get("content", "")
        return base64.b64decode(content).decode("utf-8")
    else:
        print(f"No LINKS.md found (status: {response.status_code}), continuing without links reference")
        return ""


def create_highlights_prompt(news_content: str, news_date: str, links_content: str = "") -> tuple:
    """Create prompt to extract only the most significant highlights
    
    Prompts are loaded from social/prompts/github/
    """

    links_section = ""
    if links_content:
        links_section = f"""
## REFERENCE LINKS
Use these links when relevant to add helpful references in your highlights.
Add links naturally in the description using markdown format: [text](url)

{links_content}
"""

    # Load system prompt and inject links_section
    system_prompt_template = load_prompt("highlights_system.md")
    system_prompt = system_prompt_template.replace("{links_section}", links_section)

    # Load user prompt and inject news_date and news_content
    user_prompt_template = load_prompt("highlights_user.md")
    user_prompt = user_prompt_template.replace("{news_date}", news_date).replace("{news_content}", news_content)

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
                json=payload,
                timeout=120
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


def create_highlights_pr(highlights_content: str, new_highlights: str, github_token: str, owner: str, repo: str, news_file_path: str):
    """Create a PR with updated highlights.md"""

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
    branch_name = f"highlights-update-{entry_date}"
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

    # Update highlights.md
    highlights_sha = get_file_sha(github_token, owner, repo, HIGHLIGHTS_PATH, branch_name)
    if not highlights_sha:
        highlights_sha = get_file_sha(github_token, owner, repo, HIGHLIGHTS_PATH, "main")

    highlights_api_path = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{HIGHLIGHTS_PATH}"
    highlights_encoded = base64.b64encode(highlights_content.encode()).decode()

    highlights_payload = {
        "message": f"docs: update highlights - {entry_date}",
        "content": highlights_encoded,
        "branch": branch_name
    }

    if highlights_sha:
        highlights_payload["sha"] = highlights_sha

    highlights_response = requests.put(highlights_api_path, headers=headers, json=highlights_payload)

    if highlights_response.status_code not in [200, 201]:
        print(f"Error updating highlights.md: {highlights_response.text}")
        sys.exit(1)

    print(f"Updated {HIGHLIGHTS_PATH} on branch {branch_name}")

    # Count new highlights for PR title
    new_count = len([line for line in new_highlights.split('\n') if line.strip().startswith('- **')])

    # Create PR
    pr_title = f"✨ Highlights Update - {entry_date} ({new_count} new)"
    pr_body = f"""## New Highlights

{new_highlights}

---

**Source:** `{news_file_path}`

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
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    repo_full_name = get_env('GITHUB_REPOSITORY')
    owner_name, repo_name = repo_full_name.split('/')

    # Find the latest NEWS file
    print("Looking for latest NEWS file...")
    news_file_path, news_content, news_date = get_latest_news_file(github_token, owner_name, repo_name)

    if not news_file_path or not news_content:
        print("Could not find a valid NEWS file. Exiting.")
        sys.exit(1)

    print(f"Using NEWS file: {news_file_path} (date: {news_date})")

    # Fetch links reference file
    print("Fetching LINKS.md for reference links...")
    links_content = get_links_file(github_token, owner_name, repo_name)

    # Generate highlights using AI
    print("Generating highlights...")
    system_prompt, user_prompt = create_highlights_prompt(news_content, news_date, links_content)
    ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
    new_highlights = parse_response(ai_response)

    # Check if AI returned SKIP
    if new_highlights.upper().strip() == "SKIP":
        print("AI returned SKIP - no highlights worthy of website/README this week.")
        print("Workflow complete, no PR created.")
        return

    if not new_highlights.strip():
        print("Empty highlights response from AI. Exiting.")
        return

    print(f"Generated highlights:\n{new_highlights}")

    # Fetch existing highlights
    print("Fetching existing highlights.md...")
    existing_highlights = get_current_highlights(github_token, owner_name, repo_name)

    # Merge new highlights with existing
    merged_highlights = merge_highlights(new_highlights, existing_highlights)

    # Create PR with updated highlights
    create_highlights_pr(merged_highlights, new_highlights, github_token, owner_name, repo_name, news_file_path)
    print("Highlights update completed!")


if __name__ == "__main__":
    main()
