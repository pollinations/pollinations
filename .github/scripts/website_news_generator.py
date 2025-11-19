import os
import sys
import json
import time
import random
import requests
from typing import Dict, List
from datetime import datetime, timedelta, timezone

GITHUB_API_BASE = "https://api.github.com"
POLLINATIONS_API_BASE = "https://enter.pollinations.ai/api/generate/openai"
MODEL = "openai-large"
CHUNK_SIZE = 50

def get_env(key: str, required: bool = True) -> str:
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def get_merged_prs(owner: str, repo: str, START_DATE: datetime, token: str):
    END_DATE = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    START_DATE = START_DATE.strftime("%Y-%m-%dT%H:%M:%SZ")
    base_url = "https://api.github.com/search/issues"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}"
    }

    query = f"repo:{owner}/{repo} is:pull-request is:merged merged:{START_DATE}..{END_DATE} base:main OR base:master OR base:production"
    params = {"q": query, "per_page": 100, "page": 1}

    all_prs = []
    print(f"Fetching merged PRs from {START_DATE} to {END_DATE}...")

    while True:
        response = requests.get(base_url, headers=headers, params=params)
        if response.status_code != 200:
            print(f"Error: {response.status_code} -> {response.text}")
            break

        data = response.json()
        items = data.get("items", [])

        for item in items:
            pr_url = item['pull_request']['url']
            pr_response = requests.get(pr_url, headers=headers)
            if pr_response.status_code == 200:
                pr_data = pr_response.json()
                all_prs.append({
                    'number': pr_data['number'],
                    'title': pr_data['title'],
                    'body': pr_data['body'],
                    'author': pr_data['user']['login']
                })
            time.sleep(0.1)

        if "next" not in response.links:
            break

        params["page"] += 1

    return all_prs


def get_last_digest_time() -> datetime:
    now = datetime.now(timezone.utc)
    current_weekday = now.weekday()
    if current_weekday == 0:
        days_back = 7
    else: 
        days_back = 1
    last_digest = (now - timedelta(days=days_back)).replace(hour=12, minute=0, second=0, microsecond=0)
    return last_digest


def chunk_prs(prs: List[Dict], chunk_size: int) -> List[List[Dict]]:
    return [prs[i:i + chunk_size] for i in range(0, len(prs), chunk_size)]


def create_website_news_prompt(prs: List[Dict], is_final: bool = False, all_changes: List[str] = None) -> tuple:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    system_prompt = f"""You are creating concise news entries for the Pollinations website.
    Extract ONLY major, user-impacting changes that deserve a news entry.
    
    CONTEXT: Pollinations is an open-source AI platform. Focus on what users can DO now.
    
    OUTPUT FORMAT (CRITICAL - FOLLOW EXACTLY):
    ```
    - **{today}** – **Feature Name** description in 1-2 sentences max. Include relevant links using [text](url) format and code snippets using `backticks`. | [Learn more](url)
    - **{today}** – **Another Feature** brief description. Use `model=name` format for model references. | [Docs](url)
    ```
    
    CRITICAL RULES:
    - Each entry MUST start with: - **YYYY-MM-DD** – **Feature Name**
    - Use TODAY'S DATE: {today}
    - Keep each entry to 1-2 sentences maximum
    - Focus on NEW features, models, integrations, or major improvements
    - Include inline code with `backticks` for technical terms
    - Add relevant links using [text](url) markdown
    - End with | [Learn more](url) or | [Docs](url) when applicable
    - NO PR numbers, NO author names
    - Skip: bug fixes, styling, refactors, dependency updates, error handling
    - If no major changes, return: SKIP
    - Be concise and direct - this is for quick scanning
    - Use bullet points and keep them as short and direct as possible without too much info or clutter! 
    - Be direct and on point while keeping things fairly short, simple and as concise as possible
    
    EXAMPLES OF GOOD ENTRIES:
    - **2025-11-17** – **New Audio API** now supports real-time streaming! Use `?stream=true` with audio endpoints. | [API Docs](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md)
    - **2025-11-17** – **Flux Pro Model** added with enhanced quality. Access via `?model=flux-pro`. | [Learn more](https://enter.pollinations.ai/api/docs)
    
    TONE: Direct, informative, scannable. Highlight the value immediately."""

    if is_final:
        combined_changes = "\n\n---\n\n".join(all_changes)
        user_prompt = f"""Here are the major changes from this week:
        {combined_changes}
        
        Create concise website news entries. Each entry should be 1-2 sentences max, starting with **{today}** – **Feature Name**."""
    else:
        user_prompt = f"""Analyze these {len(prs)} merged PRs and create concise news entries for MAJOR user-impacting changes only:

"""
        for i, pr in enumerate(prs, 1):
            user_prompt += f"""PR #{pr['number']}: {pr['title']}
Author: {pr['author'] if 'author' in pr else 'Unknown'}
Description: {pr['body'][:500] if pr['body'] else 'No description'}

"""

        user_prompt += f"""Create news entries ONLY for major changes (new features, models, integrations, significant improvements).
Each entry format: - **{today}** – **Feature Name** brief description with links. | [Learn more](url)
If no major changes, return: SKIP"""

    return system_prompt, user_prompt


def call_pollinations_api(system_prompt: str, user_prompt: str, token: str) -> str:
    seed = random.randint(0, 2147483647)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.7,
        "seed": seed,
        "max_tokens": 400
    }
    response = requests.post(
        POLLINATIONS_API_BASE,
        headers=headers,
        json=payload,
        timeout=120
    )
    if response.status_code != 200:
        print(f"API error: {response.status_code}")
        print(response.text)
        sys.exit(1)
    
    try:
        result = response.json()
        return result['choices'][0]['message']['content']
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        print(f"Error parsing API response: {e}")
        print(f"Response: {response.text}")
        sys.exit(1)


def parse_message(response: str) -> str:
    message = response.strip()
    
    if message.startswith('```'):
        lines = message.split('\n')
        if lines[0].strip() == '```' or lines[0].startswith('```'):
            lines = lines[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        message = '\n'.join(lines)
    
    return message.strip()


def update_news_file(news_content: str, github_token: str, owner: str, repo: str):
    """Update the newsList.js file and create a PR"""
    
    # Create new file content
    new_file_content = f'export const newsList = `{news_content}`;'
    
    # Write to local file
    file_path = 'pollinations.ai/src/config/newsList.js'
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_file_content)
    
    print(f"Updated {file_path}")
    print("File content preview:")
    print(new_file_content[:500])
    
    # Create branch and PR using GitHub API
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }
    
    # Get default branch
    repo_response = requests.get(f"{GITHUB_API_BASE}/repos/{owner}/{repo}", headers=headers)
    default_branch = repo_response.json()['default_branch']
    
    # Get latest commit SHA of default branch
    ref_response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/ref/heads/{default_branch}",
        headers=headers
    )
    base_sha = ref_response.json()['object']['sha']
    
    # Create new branch
    branch_name = f"website-news-update-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
    create_branch_response = requests.post(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/refs",
        headers=headers,
        json={
            "ref": f"refs/heads/{branch_name}",
            "sha": base_sha
        }
    )
    
    if create_branch_response.status_code not in [200, 201]:
        print(f"Error creating branch: {create_branch_response.text}")
        sys.exit(1)
    
    print(f"Created branch: {branch_name}")
    
    # Get current file SHA (if exists)
    file_api_path = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{file_path}"
    file_response = requests.get(f"{file_api_path}?ref={branch_name}", headers=headers)
    file_sha = file_response.json().get('sha') if file_response.status_code == 200 else None
    
    # Update file
    import base64
    content_encoded = base64.b64encode(new_file_content.encode()).decode()
    
    update_payload = {
        "message": f"Update website news - {datetime.now(timezone.utc).strftime('%Y-%m-%d')}",
        "content": content_encoded,
        "branch": branch_name
    }
    
    if file_sha:
        update_payload["sha"] = file_sha
    
    update_response = requests.put(file_api_path, headers=headers, json=update_payload)
    
    if update_response.status_code not in [200, 201]:
        print(f"Error updating file: {update_response.text}")
        sys.exit(1)
    
    print(f"Updated file on branch {branch_name}")
    
    # Create PR
    pr_title = f"Website Weekly Update - {datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
    pr_body = f"""## Weekly Website News Update

This PR updates the website news section with this week's major changes.

### News Entries

{news_content}

### Changes
- Updated `pollinations.ai/src/config/newsList.js` with latest news entries

**Generated automatically by GitHub Actions**
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
        print(f"Error creating PR: {pr_response.text}")
        sys.exit(1)
    
    pr_data = pr_response.json()
    print(f"✅ Created PR #{pr_data['number']}: {pr_data['html_url']}")


def main():
    github_token = get_env('POLLI_PAT')
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    owner_name = "pollinations"  
    repo_name = "pollinations"
    
    last_digest_time = get_last_digest_time()
    merged_prs = get_merged_prs(owner_name, repo_name, last_digest_time, github_token)
    
    print(f"Total merged PRs found: {len(merged_prs)}")
    
    if not merged_prs:
        print("No merged PRs found for this period. Skipping website update.")
        return

    print(f"Processing {len(merged_prs)} PRs for website news...")
    
    if len(merged_prs) <= CHUNK_SIZE:
        print("Small batch - using single AI call...")
        system_prompt, user_prompt = create_website_news_prompt(merged_prs)
        ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
        news_content = parse_message(ai_response)
    else:
        print(f"Large batch - chunking into {CHUNK_SIZE} PR batches...")
        pr_chunks = chunk_prs(merged_prs, CHUNK_SIZE)
        all_changes = []
        
        for i, chunk in enumerate(pr_chunks, 1):
            print(f"Processing chunk {i}/{len(pr_chunks)} ({len(chunk)} PRs)...")
            sys_prompt, usr_prompt = create_website_news_prompt(chunk)
            response = call_pollinations_api(sys_prompt, usr_prompt, pollinations_token)
            changes = parse_message(response)
            
            if not changes.upper().startswith('SKIP'):
                all_changes.append(changes)
            time.sleep(0.5)
        
        if not all_changes:
            print("No major changes found across all chunks. Skipping website update.")
            return
        
        print("Creating final website news entries...")
        sys_prompt, usr_prompt = create_website_news_prompt([], is_final=True, all_changes=all_changes)
        ai_response = call_pollinations_api(sys_prompt, usr_prompt, pollinations_token)
        news_content = parse_message(ai_response)

    if news_content.upper().startswith('SKIP'):
        print("AI returned SKIP — no major updates for website.")
        return
    
    # Update file and create PR
    update_news_file(news_content, github_token, owner_name, repo_name)
    print("✅ Website news update completed!")


if __name__ == "__main__":
    main()
