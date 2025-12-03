import os
import sys
import json
import time
import random
import re
import base64
import requests
from typing import Dict, List
from datetime import datetime, timedelta, timezone

GITHUB_API_BASE = "https://api.github.com"
POLLINATIONS_API_BASE = "https://enter.pollinations.ai/api/generate/openai"
MODEL = "claude-large"
CHUNK_SIZE = 50
NEWS_FOLDER = "NEWS"


def get_env(key: str, required: bool = True) -> str:
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def get_date_range() -> tuple[datetime, datetime]:
    """Get the date range for PR search - last 7 days"""
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=7)
    return start_date, end_date


def get_merged_prs(owner: str, repo: str, start_date: datetime, token: str) -> List[Dict]:
    end_date = datetime.now(timezone.utc)
    end_str = end_date.strftime("%Y-%m-%dT%H:%M:%SZ")
    start_str = start_date.strftime("%Y-%m-%dT%H:%M:%SZ")

    base_url = "https://api.github.com/search/issues"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}"
    }

    all_prs = []
    print(f"Fetching merged PRs from {start_str} to {end_str}...")

    target_branches = ['main']
    pr_numbers_seen = set()

    for branch in target_branches:
        query = f"repo:{owner}/{repo} is:pull-request is:merged merged:{start_str}..{end_str} base:{branch}"
        params = {"q": query, "per_page": 100, "page": 1}

        while True:
            response = requests.get(base_url, headers=headers, params=params)
            if response.status_code != 200:
                print(f"Error searching base:{branch}: {response.status_code} -> {response.text}")
                break

            data = response.json()
            items = data.get("items", [])

            for item in items:
                pr_number = item['number']
                if pr_number in pr_numbers_seen:
                    continue
                pr_numbers_seen.add(pr_number)

                pr_url = item['pull_request']['url']
                pr_response = requests.get(pr_url, headers=headers)
                if pr_response.status_code == 200:
                    pr_data = pr_response.json()
                    all_prs.append({
                        'number': pr_data['number'],
                        'title': pr_data['title'],
                        'body': pr_data['body'],
                        'author': pr_data['user']['login'],
                        'merged_at': pr_data['merged_at'],
                        'html_url': pr_data['html_url']
                    })
                time.sleep(0.1)

            if "next" not in response.links:
                break

            params["page"] += 1

    return all_prs


def chunk_prs(prs: List[Dict], chunk_size: int) -> List[List[Dict]]:
    return [prs[i:i + chunk_size] for i in range(0, len(prs), chunk_size)]


def create_news_prompt(prs: List[Dict], is_final: bool = False, all_changes: List[str] = None) -> tuple:
    """Create prompt to format ALL PRs for NEWS.md - no filtering, this is source of truth"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    system_prompt = f"""You are creating a weekly changelog entry for NEWS.md.

NEWS.md is the SINGLE SOURCE OF TRUTH for all platform updates. It will be consumed by:
- Discord bot (to post weekly digests)
- Website news section
- Other automated workflows
- Developers and users looking for complete changelog

CRITICAL: Include EVERY PR provided. Do NOT skip or filter any PRs. Do NOT decide what's "important" - that's for downstream consumers to decide. This must be a COMPLETE record.

OUTPUT FORMAT (follow exactly):
```
- **PR Title/Feature Name** — Clear description of the change. Include technical details, endpoints, parameters where relevant. Use `backticks` for code. [PR #{'{number}'}](url)
```

GUIDELINES:
- Include ALL PRs - bug fixes, features, refactors, dependencies, EVERYTHING
- Each bullet = one PR (no exceptions, no skipping)
- Write clear, informative descriptions
- Use `backticks` for technical terms, code, endpoints, parameters
- Include the PR link at the end of each entry
- Be concise but complete - other systems will format/filter as needed

TONE: Professional, factual, comprehensive. This is a historical record that other systems depend on."""

    if is_final:
        combined_changes = "\n\n".join(all_changes)
        user_prompt = f"""Consolidate these PR entries into a final clean list. Remove any duplicates but keep ALL unique entries:

{combined_changes}

Output the complete, deduplicated list."""
    else:
        user_prompt = f"""Format ALL {len(prs)} PRs into changelog entries. Include every single one:

"""
        for pr in prs:
            body_preview = pr['body'][:500] if pr['body'] else 'No description'
            user_prompt += f"""PR #{pr['number']}: {pr['title']}
Author: @{pr['author']}
URL: {pr['html_url']}
Merged: {pr['merged_at']}
Description: {body_preview}

"""

        user_prompt += """Format each PR as a bullet point. Do NOT skip any PRs."""

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
    message = response.strip()

    if message.startswith('```'):
        lines = message.split('\n')
        if lines[0].strip() == '```' or lines[0].startswith('```'):
            lines = lines[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        message = '\n'.join(lines)

    return message.strip()


def check_news_file_exists(github_token: str, owner: str, repo: str, file_path: str) -> bool:
    """Check if a news file already exists in the repo"""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{file_path}",
        headers=headers
    )

    return response.status_code == 200


def create_news_file_content(news_entry: str, entry_date: str) -> str:
    """Create content for individual news file"""
    return f"""# Weekly Update - {entry_date}

{news_entry}
"""


def create_pr_with_news(news_content: str, github_token: str, owner: str, repo: str, pr_count: int):
    """Create a PR with a new weekly news file in NEWS/ folder"""

    entry_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    news_file_path = f"{NEWS_FOLDER}/{entry_date}.md"

    # Check if file for this date already exists
    if check_news_file_exists(github_token, owner, repo, news_file_path):
        print(f"News file for {entry_date} already exists. Skipping.")
        return

    # Create content for the new file
    file_content = create_news_file_content(news_content, entry_date)

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
    branch_name = f"news-update-{entry_date}"
    create_branch_response = requests.post(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/refs",
        headers=headers,
        json={
            "ref": f"refs/heads/{branch_name}",
            "sha": base_sha
        }
    )

    if create_branch_response.status_code not in [200, 201]:
        # Branch might already exist, try to update it
        if "Reference already exists" in create_branch_response.text:
            print(f"Branch {branch_name} already exists, updating...")
        else:
            print(f"Error creating branch: {create_branch_response.text}")
            sys.exit(1)

    print(f"Created branch: {branch_name}")

    # Create the new file (no SHA needed for new file)
    file_api_path = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{news_file_path}"
    content_encoded = base64.b64encode(file_content.encode()).decode()

    update_payload = {
        "message": f"docs: weekly news update - {entry_date}",
        "content": content_encoded,
        "branch": branch_name
    }

    update_response = requests.put(file_api_path, headers=headers, json=update_payload)

    if update_response.status_code not in [200, 201]:
        print(f"Error creating file: {update_response.text}")
        sys.exit(1)

    print(f"Created {news_file_path} on branch {branch_name}")

    # Create PR
    pr_title = f"📰 Weekly News Update - {entry_date}"
    pr_body = f"""## Weekly News Update

This PR adds the weekly news file `{news_file_path}`.

**PRs included:** {pr_count}

### New Entry Preview

{news_content}

---
**Note:** When this PR is merged, it will automatically trigger the Discord notification workflow.

🤖 Generated automatically by GitHub Actions
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
        # PR might already exist
        if "A pull request already exists" in pr_response.text:
            print("PR already exists for this branch")
            return
        print(f"Error creating PR: {pr_response.text}")
        sys.exit(1)

    pr_data = pr_response.json()
    print(f"✅ Created PR #{pr_data['number']}: {pr_data['html_url']}")


def main():
    github_token = os.getenv('POLLI_PAT') or os.getenv('GITHUB_TOKEN')
    if not github_token:
        print("Error: POLLI_PAT or GITHUB_TOKEN is required")
        sys.exit(1)

    pollinations_token = get_env('POLLINATIONS_TOKEN')
    repo_full_name = get_env('GITHUB_REPOSITORY')
    owner_name, repo_name = repo_full_name.split('/')

    start_date, end_date = get_date_range()
    merged_prs = get_merged_prs(owner_name, repo_name, start_date, github_token)

    print(f"Total merged PRs found: {len(merged_prs)}")

    if not merged_prs:
        print("No merged PRs found for this period. Skipping news update.")
        return

    print(f"Processing {len(merged_prs)} PRs for NEWS.md (including ALL)...")

    if len(merged_prs) <= CHUNK_SIZE:
        print("Small batch - using single AI call...")
        system_prompt, user_prompt = create_news_prompt(merged_prs)
        ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
        news_content = parse_response(ai_response)
    else:
        print(f"Large batch - chunking into {CHUNK_SIZE} PR batches...")
        pr_chunks = chunk_prs(merged_prs, CHUNK_SIZE)
        all_changes = []

        for i, chunk in enumerate(pr_chunks, 1):
            print(f"Processing chunk {i}/{len(pr_chunks)} ({len(chunk)} PRs)...")
            sys_prompt, usr_prompt = create_news_prompt(chunk)
            response = call_pollinations_api(sys_prompt, usr_prompt, pollinations_token)
            changes = parse_response(response)
            all_changes.append(changes)
            time.sleep(0.5)

        print("Consolidating all entries...")
        sys_prompt, usr_prompt = create_news_prompt([], is_final=True, all_changes=all_changes)
        ai_response = call_pollinations_api(sys_prompt, usr_prompt, pollinations_token)
        news_content = parse_response(ai_response)

    if not news_content.strip():
        print("Empty response from AI. This shouldn't happen.")
        sys.exit(1)

    # Create PR with news update
    create_pr_with_news(news_content, github_token, owner_name, repo_name, len(merged_prs))
    print("✅ News generation completed!")


if __name__ == "__main__":
    main()
