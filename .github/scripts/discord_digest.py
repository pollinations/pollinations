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

def create_chunk_prompt(prs: List[Dict], chunk_num: int, total_chunks: int) -> tuple:
    system_prompt = """You are analyzing a subset of merged PRs for a weekly digest.
Extract ONLY user-facing changes - features, improvements, bug fixes that users will notice.
Focus on WHAT changed for users, not technical implementation details.

FORMAT your response as a simple bullet list:
- Feature/improvement/fix description (brief, user-focused)
- Another change
- Include the date of the change range
- etc.

If a PR has no user-facing impact, skip it entirely.
If NO PRs in this batch have user impact, return only: SKIP"""

    user_prompt = f"""Analyze batch {chunk_num}/{total_chunks} ({len(prs)} PRs):

"""

    for pr in prs:
        user_prompt += f"""PR #{pr['number']}: {pr['title']}
Description: {pr['body'][:300] if pr['body'] else 'No description'}

"""

    user_prompt += "\nList only user-facing changes as bullet points."

    return system_prompt, user_prompt

def create_final_digest_prompt(all_changes: List[str]) -> tuple:
    MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    end_date = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    start_date = get_last_digest_time().strftime("%Y-%m-%dT%H:%M:%SZ")
    date_str = f"From {start_date.split('T')[0].split('-')[2]} {MONTH[int(start_date.split('T')[0].split('-')[1]) - 1]} {start_date.split('T')[0].split('-')[0]} to {end_date.split('T')[0].split('-')[2]} {MONTH[int(end_date.split('T')[0].split('-')[1]) - 1]} {end_date.split('T')[0].split('-')[0]}"
    print(f"Creating final digest for period: {date_str}")
    system_prompt = f"""
    You are creating the FINAL weekly digest for Pollinations AI Discord community.
    You've been given pre-filtered user-facing changes. Now create ONE polished, engaging message.

    CONTEXT: Pollinations is an open-source AI platform. Your audience is USERS, not developers.

    OUTPUT FORMAT:
    ```
    [Greet <@&1424461167883194418> naturally and casually in a playful way]

    ## 🌸 Weekly Update - {date_str}
    (do not change anything from the mentioned date_str, strictly use it as is)
    ### [Choose section name with emoji based on changes]
    - Polished description of change (benefits-focused)
    - Another change
    - Keep concise and clear

    ### [Another section if it makes sense]
    - More organized changes
    - Group logically for users

    [Add sections as needed - organize however makes most sense!]
    ```

    RULES:
    - Greet <@&1424461167883194418> creatively and playfully
    - Group related changes into logical sections (Discord Bot, New Features, Bug Fixes, etc.)
    - Use emojis that fit each section
    - Remove duplicate or very similar items
    - Try to keep it short simple and on-point without too much clutter
    - Polish the language to be engaging and user-focused
    - NO PR numbers, NO author names, NO technical jargon
    - Only user facing changes or things that actually impact users like limits and such
    - Avoid focusing on developer releated insights like backend changes or anything that doesn't direct affect the users 
    - Make the final response such that it will be seen from the user's prespective
    - Keep it concise but complete
    - A bit of fun and playfulness is encouraged!
    TONE: Conversational, friendly, exciting about improvements. Be concise, on-point and professional while being a bit witty!"""
    combined_changes = "\n\n---\n\n".join(all_changes)
    
    user_prompt = f"""Here are the user-facing changes from this week:
    {combined_changes}
    Create a polished weekly digest that groups these changes logically and presents them in an engaging way for users."""
    
    return system_prompt, user_prompt

def create_single_digest_prompt(prs: List[Dict]) -> tuple:
    if not prs:
        return "", ""
    MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    end_date = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    start_date = get_last_digest_time().strftime("%Y-%m-%dT%H:%M:%SZ")
    date_str = f"From {start_date.split('T')[0].split('-')[2]} {MONTH[int(start_date.split('T')[0].split('-')[1]) - 1]} {start_date.split('T')[0].split('-')[0]} to {end_date.split('T')[0].split('-')[2]} {MONTH[int(end_date.split('T')[0].split('-')[1]) - 1]} {end_date.split('T')[0].split('-')[0]}"
    print(f"Creating final digest for period: {date_str}")
    system_prompt = f"""
    You are creating a weekly digest for the Pollinations AI Discord community.
    Analyze the merged PRs and create ONE clean, engaging update message for USERS of the platform.

    CONTEXT: Pollinations is an open-source AI platform. You're talking to USERS who use the service, NOT developers.

    OUTPUT FORMAT:
    ```
    [Greet <@&1424461167883194418> naturally and casually in a playful way]

    ## 🌸 Weekly Update - {date_str}
    (do not change anything from the mentioned date_str, strictly use it as is)
    [Create sections that make sense for what actually changed - you have COMPLETE FREEDOM]
    [Examples: "🎮 Discord Bot", "🚀 New Models", "⚡ Speed Improvements", "🎨 UI Updates", "🔧 Bug Fixes", etc.]

    ### [Your chosen section name with emoji]
    - What changed for users (brief, clear)
    - Another user-facing change
    - Focus on benefits users will notice

    ### [Another section if needed]
    - More changes that affect users
    - Keep it user-focused

    [Add as many sections as needed - organize however makes most sense!]
    ```

    YOUR COMPLETE FREEDOM:
    - Choose ANY section names that fit the changes
    - Create ANY number of sections (1-5 typically)
    - Use ANY emojis that make sense
    - Group changes however is most logical for users
    - Focus on what USERS will experience, not technical details

    CRITICAL RULES:
    - Greet <@&1424461167883194418> naturally and casually - be creative with your greeting!
    - Write for USERS, not developers - focus on benefits they'll see
    - Keep bullet points concise and clear
    - NO PR numbers, NO author names, NO technical jargon
    - Skip internal/developer changes that don't affect users
    - If no user-facing changes, return only one word "SKIP"
    - A bit of fun and sarcasm is ok! 

    TONE: Conversational, friendly, focus on user benefits and playful
    LENGTH: Keep it concise but complete"""
    user_prompt = f"""Analyze these {len(prs)} merged PRs and create a weekly digest:
    """
    
    for i, pr in enumerate(prs, 1):
        user_prompt += f"""PR #{pr['number']}: {pr['title']}
        Author: {pr['author'] if 'author' in pr else 'Some Contributor'}
        Description: {pr['body'][:500] if pr['body'] else 'No description'}
        """
    
    user_prompt += """
    Create a clean weekly digest focusing on user impact. Group related changes naturally.
    Remember: Focus on WHAT changed for users, not WHO changed it or technical details."""
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
        "seed": seed
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
        system_prompt, user_prompt = create_single_digest_prompt(merged_prs)
        ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
        message = parse_message(ai_response)
        
    else:
        print(f"Large batch - chunking into {CHUNK_SIZE} PR batches...")
        
        pr_chunks = chunk_prs(merged_prs, CHUNK_SIZE)
        all_changes = []
        for i, chunk in enumerate(pr_chunks, 1):
            print(f"Processing chunk {i}/{len(pr_chunks)} ({len(chunk)} PRs)...")
            sys_prompt, usr_prompt = create_chunk_prompt(chunk, i, len(pr_chunks))
            response = call_pollinations_api(sys_prompt, usr_prompt, pollinations_token)
            changes = parse_message(response)
            
            if not changes.upper().startswith('SKIP'):
                all_changes.append(changes)
            time.sleep(0.5)  
        
        if not all_changes:
            print("No user-facing changes found across all chunks.")
            return
        
        print("Creating final polished digest...")
        sys_prompt, usr_prompt = create_final_digest_prompt(all_changes)
        ai_response = call_pollinations_api(sys_prompt, usr_prompt, pollinations_token)
        message = parse_message(ai_response)

    if message.upper().startswith('SKIP'):
        print("AI returned SKIP — no user-facing updates.")
        return
    post_to_discord(discord_webhook, message)

if __name__ == "__main__":
    main()


