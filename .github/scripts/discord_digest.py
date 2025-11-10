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
    # START_DATE = "2025-10-28T00:00:00Z"
    END_DATE = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    START_DATE = START_DATE.strftime("%Y-%m-%dT%H:%M:%SZ")
    base_url = "https://api.github.com/search/issues"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}"
    }

    query = f"repo:{owner}/{repo} is:pull-request is:merged merged:{START_DATE}..{END_DATE}"
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
        days_back = 3
    elif current_weekday == 4:
        days_back = 4
    else:
        days_back = 7

    last_digest = (now - timedelta(days=days_back)).replace(hour=12, minute=0, second=0, microsecond=0)
    return last_digest

def chunk_prs(prs: List[Dict], chunk_size: int) -> List[List[Dict]]:
    return [prs[i:i + chunk_size] for i in range(0, len(prs), chunk_size)]

def create_digest_prompt(prs: List[Dict], is_final: bool = False, all_changes: List[str] = None) -> tuple:
    MONTH = ["Jan", "Feb", "Mar", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    end_date = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    start_date = get_last_digest_time().strftime("%Y-%m-%dT%H:%M:%SZ")
    date_str = f"From {start_date.split('T')[0].split('-')[2]} {MONTH[int(start_date.split('T')[0].split('-')[1]) - 1]} {start_date.split('T')[0].split('-')[0]} to {end_date.split('T')[0].split('-')[2]} {MONTH[int(end_date.split('T')[0].split('-')[1]) - 1]} {end_date.split('T')[0].split('-')[0]}"
    
    system_prompt = f"""You are creating a weekly digest for the Pollinations AI Discord community.
    Extract ONLY major, user-impacting changes - the real wins, not the fixes or maintenance.
    Ignore: bug fixes, styling updates, UI tweaks, refactors, dependency updates, code cleanup, error handling.
    Include: new features, model additions, performance gains, API improvements, significant workflow enhancements, user experience upgrades.
    In general ignore the updates or modifications that does not impact the users directly, its a user-facing message rather then developer/internal focused.

    CONTEXT: Pollinations is an open-source AI platform. Your audience is USERS who care about what they can DO now.

    OUTPUT FORMAT:
    ```
    [Greet <@&1424461167883194418> naturally and casually in a playful, witty way. short]

    ## 🌸 Weekly Update - {date_str}
    (do not change anything from the mentioned date_str, strictly use it as is)

    [Create sections that make sense - you have COMPLETE FREEDOM]
    [MAKE SURE THAT WE PUT ALL THE INFO IN SOMEWHERE AROUND 200-400 WORDS TOTAL]
    [Examples: "🎮 Discord Bot", "🚀 New Models", "⚡ Performance", "🔄 API Changes", "✨ Feature Drops", etc.]

    ### [Section with emoji]
    - Major change with clear user benefit
    - Another significant addition
    - Focus on what users can now do

    ### [Another section if needed]
    - More impactful changes
    - Keep it user-focused and exciting

    [Add as many sections as needed - organize however makes most sense!]
    ```

    CRITICAL RULES:
    - Greet <@&1424461167883194418> naturally - be witty and creative!
    - Write for USERS - focus on impact and excitement, not technical details
    - Only include MAJOR changes that matter to users
    - NO PR numbers, NO author names, NO technical jargon
    - Skip all bug fixes, error handling, and maintenance work
    - Skip styling and UI cosmetics completely
    - If no major impactful changes found, return only: SKIP
    - Be witty, fun, and celebratory about real wins
    - Do not add unnecessary length to the output
    - Keep it as concise and brief as possible while still covering whats needed
    - Focus mainly on changes that impact the user's who use services powered by pollinations rather than developers who use pollinations.
    - Give the final output as whole that isn't overloaded with technical info nor full of clutter but appealing to users while being fairly simple! 

    TONE: Conversational, witty, celebratory. Highlight the cool stuff.
    LENGTH: Keep it punchy but complete"""

    if is_final:
        combined_changes = "\n\n---\n\n".join(all_changes)
        user_prompt = f"""Here are the major changes from this week:
        {combined_changes}

        Create a polished, witty weekly digest that celebrates these wins and makes them exciting for users. Group logically and present the real impact."""
    else:
        user_prompt = f"""Analyze these {len(prs)} merged PRs and extract only MAJOR, user-impacting changes:"""
        for i, pr in enumerate(prs, 1):
            user_prompt += f"""PR #{pr['number']}: {pr['title']}
            Author: {pr['author'] if 'author' in pr else 'Some Contributor'}
            Description: {pr['body'][:500] if pr['body'] else 'No description'}"""

        user_prompt += """Extract only major changes that impact users (new features, significant improvements, API enhancements, performance wins).
        Ignore bug fixes, styling, code cleanup, dependency updates, error handling.
        If no major impactful changes found, return only: SKIP"""

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
        "max_tokens": 250
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


def chunk_message(message: str, max_length: int = 1900) -> List[str]:
    if len(message) <= max_length:
        return [message]
    chunks = []
    remaining = message
    while remaining:
        if len(remaining) <= max_length:
            chunks.append(remaining)
            break
        chunk = remaining[:max_length]
        split_point = max_length
        
        last_para = chunk.rfind('\n\n')
        if last_para > max_length * 0.5:
            split_point = last_para + 2
        else:
            last_line = chunk.rfind('\n')
            if last_line > max_length * 0.5:
                split_point = last_line + 1
            else:
                last_space = chunk.rfind(' ')
                if last_space > max_length * 0.5:
                    split_point = last_space + 1
        
        chunks.append(remaining[:split_point].rstrip())
        remaining = remaining[split_point:].lstrip()
    return chunks

def post_to_discord(webhook_url: str, message: str):
    chunks = chunk_message(message)
    
    for i, chunk in enumerate(chunks):
        if i > 0:
            time.sleep(0.5)
        
        payload = {"content": chunk}
        response = requests.post(webhook_url, json=payload)
        
        if response.status_code not in [200, 204]:
            print(f"Discord error: {response.status_code}")
            print(response.text)
            sys.exit(1)
    
    print("Digest posted to Discord.")

def main():
    github_token = get_env('POLLI_PAT')
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    discord_webhook = os.getenv('DISCORD_WEBHOOK_DIGEST') or get_env('DISCORD_WEBHOOK_URL')
    owner_name = "pollinations"  
    repo_name = "pollinations"
    last_digest_time = get_last_digest_time()
    merged_prs = get_merged_prs(owner_name, repo_name, last_digest_time, github_token)
    print(f"Total merged PRs found: {len(merged_prs)}")
    if not merged_prs:
        print("No merged PRs found for this period. Skipping.")
        return

    print(f"Processing {len(merged_prs)} PRs...")
    if len(merged_prs) <= CHUNK_SIZE:
        print("Small batch - using single AI call...")
        system_prompt, user_prompt = create_digest_prompt(merged_prs)
        ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
        message = parse_message(ai_response)
        
    else:
        print(f"Large batch - chunking into {CHUNK_SIZE} PR batches...")
        
        pr_chunks = chunk_prs(merged_prs, CHUNK_SIZE)
        all_changes = []
        for i, chunk in enumerate(pr_chunks, 1):
            print(f"Processing chunk {i}/{len(pr_chunks)} ({len(chunk)} PRs)...")
            sys_prompt, usr_prompt = create_digest_prompt(chunk)
            response = call_pollinations_api(sys_prompt, usr_prompt, pollinations_token)
            changes = parse_message(response)
            
            if not changes.upper().startswith('SKIP'):
                all_changes.append(changes)
            time.sleep(0.5)  
        
        if not all_changes:
            print("No functional changes found across all chunks.")
            return
        
        print("Creating final polished digest...")
        sys_prompt, usr_prompt = create_digest_prompt([], is_final=True, all_changes=all_changes)
        ai_response = call_pollinations_api(sys_prompt, usr_prompt, pollinations_token)
        message = parse_message(ai_response)

    if message.upper().startswith('SKIP'):
        print("AI returned SKIP — no functional updates.")
        return
    post_to_discord(discord_webhook, message)

if __name__ == "__main__":
    main()


