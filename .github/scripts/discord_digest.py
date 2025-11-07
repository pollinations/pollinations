#!/usr/bin/env python3
"""
Simple Weekly Digest Generator
Gets recent merged PRs and creates a weekly digest in one AI call
No temp storage, no complexity - just simple and direct
"""

import os
import sys
import json
import time
import random
import requests
from typing import Dict, List
from datetime import datetime, timedelta, timezone

# Configuration
GITHUB_API_BASE = "https://api.github.com"
POLLINATIONS_API_BASE = "https://enter.pollinations.ai/api/generate/openai"
MODEL = "openai-large"
CHUNK_SIZE = 50  # PRs per chunk for large batches

def get_env(key: str, required: bool = True) -> str:
    """Get environment variable"""
    value = os.getenv(key)
    if required and not value:
        print(f"❌ Error: {key} environment variable is required")
        sys.exit(1)
    return value

def get_recent_merged_prs(repo: str, token: str, since_time: datetime) -> List[Dict]:
    """Get recently merged PRs using GitHub Search API - efficient and accurate"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }
    
    # Format date for GitHub search (ISO 8601)
    since_str = since_time.strftime('%Y-%m-%dT%H:%M:%S')
    
    merged_prs = []
    page = 1
    per_page = 100
    
    print(f"📦 Searching merged PRs for {repo} since {since_time.isoformat()}...")
    
    while True:
        # Use Search API with merged date filter
        url = f"{GITHUB_API_BASE}/search/issues"
        params = {
            "q": f"repo:{repo} is:pr is:merged merged:>={since_str}",
            "sort": "created",
            "order": "desc",
            "per_page": per_page,
            "page": page
        }
        
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code != 200:
            print(f"❌ GitHub API error: {response.status_code}")
            print(response.text)
            sys.exit(1)
        
        data = response.json()
        items = data.get('items', [])
        
        if not items:
            break
        
        for pr in items:
            # Get PR body - Search API doesn't always include full body
            pr_url = pr.get('pull_request', {}).get('url')
            if pr_url:
                pr_detail = requests.get(pr_url, headers=headers)
                if pr_detail.status_code == 200:
                    pr_data = pr_detail.json()
                    body = pr_data.get('body', 'No description')
                else:
                    body = pr.get('body', 'No description')
            else:
                body = pr.get('body', 'No description')
            
            merged_prs.append({
                'number': pr.get('number', 0),
                'title': pr.get('title', 'No title'),
                'body': body,
                'author': pr.get('user', {}).get('login', 'Unknown'),
                'merged_at': pr.get('closed_at'),  # closed_at is merge time for merged PRs
                'url': pr.get('html_url', '#')
            })
            
            time.sleep(0.1)  # Small delay for detail requests
        
        print(f"📄 Page {page} fetched ({len(items)} PRs).")
        
        # Check if there are more results
        total_count = data.get('total_count', 0)
        if len(merged_prs) >= total_count:
            break
        
        page += 1
        time.sleep(0.3)  # Rate limiting between pages
    
    merged_prs.sort(key=lambda x: x['number'])
    print(f"✅ Total merged PRs found: {len(merged_prs)}")
    return merged_prs

def get_last_digest_time() -> datetime:
    """Get the time of the last digest based on the fixed Monday/Friday schedule"""
    now = datetime.now(timezone.utc)
    current_weekday = now.weekday()
    
    if current_weekday == 0:  # Monday
        # Last digest was Friday at 00:00 UTC (start of day)
        days_back = 3
        last_digest = (now - timedelta(days=days_back)).replace(hour=0, minute=0, second=0, microsecond=0)
    elif current_weekday == 4:  # Friday  
        # Last digest was Monday at 00:00 UTC (start of day)
        days_back = 4
        last_digest = (now - timedelta(days=days_back)).replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        # Other days - cover last 5 days
        last_digest = (now - timedelta(days=5)).replace(hour=0, minute=0, second=0, microsecond=0)
    
    return last_digest

def chunk_prs(prs: List[Dict], chunk_size: int) -> List[List[Dict]]:
    """Split PRs into manageable chunks"""
    return [prs[i:i + chunk_size] for i in range(0, len(prs), chunk_size)]

def create_chunk_prompt(prs: List[Dict], chunk_num: int, total_chunks: int) -> tuple:
    """Create prompt for analyzing a chunk of PRs"""
    system_prompt = """You are analyzing a subset of merged PRs for a weekly digest.
Extract ONLY user-facing changes - features, improvements, bug fixes that users will notice.
Focus on WHAT changed for users, not technical implementation details.

FORMAT your response as a simple bullet list:
- Feature/improvement/fix description (brief, user-focused)
- Another change
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
    """Create prompt for final digest compilation"""
    today = datetime.now(timezone.utc)
    week_ago = today - timedelta(days=4)
    
    if week_ago.month == today.month:
        date_str = f"{week_ago.strftime('%b %d')}-{today.strftime('%d, %Y')}"
    else:
        date_str = f"{week_ago.strftime('%b %d')} - {today.strftime('%b %d, %Y')}"
    
    system_prompt = f"""You are creating the FINAL weekly digest for Pollinations AI Discord community.
You've been given pre-filtered user-facing changes. Now create ONE polished, engaging message.

CONTEXT: Pollinations is an open-source AI platform. Your audience is USERS, not developers.

OUTPUT FORMAT:
```
[Greet <@&1424461167883194418> naturally and casually in a playful way]

## 🌸 Weekly Update - {date_str}

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
- Polish the language to be engaging and user-focused
- NO PR numbers, NO author names, NO technical jargon
- Keep it concise but complete
- A bit of fun and playfulness is encouraged!

TONE: Conversational, friendly, exciting about improvements"""

    combined_changes = "\n\n---\n\n".join(all_changes)
    
    user_prompt = f"""Here are the user-facing changes from this week:

{combined_changes}

Create a polished weekly digest that groups these changes logically and presents them in an engaging way for users."""
    
    return system_prompt, user_prompt

def create_single_digest_prompt(prs: List[Dict]) -> tuple:
    """Create the AI prompt with all PR data for small batches"""
    if not prs:
        return "", ""
    
    today = datetime.now(timezone.utc)
    week_ago = today - timedelta(days=4)
    
    if week_ago.month == today.month:
        date_str = f"{week_ago.strftime('%b %d')}-{today.strftime('%d, %Y')}"
    else:
        date_str = f"{week_ago.strftime('%b %d')} - {today.strftime('%b %d, %Y')}"
    
    system_prompt = f"""You are creating a weekly digest for the Pollinations AI Discord community.
Analyze the merged PRs and create ONE clean, engaging update message for USERS of the platform.

CONTEXT: Pollinations is an open-source AI platform. You're talking to USERS who use the service, NOT developers.

OUTPUT FORMAT:
```
[Greet <@&1424461167883194418> naturally and casually in a playful way]

## 🌸 Weekly Update - {date_str}

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
Author: {pr['author']}
Description: {pr['body'][:500] if pr['body'] else 'No description'}

"""
    
    user_prompt += """
Create a clean weekly digest focusing on user impact. Group related changes naturally.
Remember: Focus on WHAT changed for users, not WHO changed it or technical details."""
    
    return system_prompt, user_prompt

def call_pollinations_api(system_prompt: str, user_prompt: str, token: str) -> str:
    """Call Pollinations AI API"""
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
        "temperature": 0.3,
        "seed": seed
    }
    
    response = requests.post(
        POLLINATIONS_API_BASE,
        headers=headers,
        json=payload,
        timeout=120
    )
    
    if response.status_code != 200:
        print(f"❌ API error: {response.status_code}")
        print(response.text)
        sys.exit(1)
    
    try:
        result = response.json()
        return result['choices'][0]['message']['content']
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        print(f"❌ Error parsing API response: {e}")
        print(f"Response: {response.text}")
        sys.exit(1)

def parse_message(response: str) -> str:
    """Clean up AI response"""
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
    """Split message into chunks at natural breakpoints"""
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
    """Post message to Discord with automatic chunking if needed"""
    chunks = chunk_message(message)
    
    for i, chunk in enumerate(chunks):
        if i > 0:
            time.sleep(0.5)
        
        payload = {"content": chunk}
        response = requests.post(webhook_url, json=payload)
        
        if response.status_code not in [200, 204]:
            print(f"❌ Discord error: {response.status_code}")
            print(response.text)
            sys.exit(1)
    
    print("✅ Digest posted to Discord.")

def main():
    # Get environment variables
    github_token = get_env('GITHUB_TOKEN')
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    discord_webhook = os.getenv('DISCORD_WEBHOOK_DIGEST') or get_env('DISCORD_WEBHOOK_URL')
    repo_name = get_env('REPO_FULL_NAME')
    
    # Get last digest time
    last_digest_time = get_last_digest_time()
    
    # Get recent merged PRs using Search API
    merged_prs = get_recent_merged_prs(repo_name, github_token, last_digest_time)
    
    if not merged_prs:
        print("ℹ️ No merged PRs found for this period. Skipping.")
        return
    
    print(f"\n📊 Processing {len(merged_prs)} PRs...")
    
    # For small batches, use single call (your original approach)
    if len(merged_prs) <= CHUNK_SIZE:
        print("🧠 Small batch - using single AI call...")
        system_prompt, user_prompt = create_single_digest_prompt(merged_prs)
        ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
        message = parse_message(ai_response)
        
    else:
        # For large batches, use chunking approach
        print(f"🧩 Large batch - chunking into {CHUNK_SIZE} PR batches...")
        
        pr_chunks = chunk_prs(merged_prs, CHUNK_SIZE)
        all_changes = []
        
        # Step 1: Extract user-facing changes from each chunk
        for i, chunk in enumerate(pr_chunks, 1):
            print(f"  📦 Processing chunk {i}/{len(pr_chunks)} ({len(chunk)} PRs)...")
            
            sys_prompt, usr_prompt = create_chunk_prompt(chunk, i, len(pr_chunks))
            response = call_pollinations_api(sys_prompt, usr_prompt, pollinations_token)
            changes = parse_message(response)
            
            if not changes.upper().startswith('SKIP'):
                all_changes.append(changes)
            
            time.sleep(0.5)  # Rate limiting
        
        if not all_changes:
            print("ℹ️ No user-facing changes found across all chunks.")
            return
        
        # Step 2: Compile final digest
        print("🎨 Creating final polished digest...")
        sys_prompt, usr_prompt = create_final_digest_prompt(all_changes)
        ai_response = call_pollinations_api(sys_prompt, usr_prompt, pollinations_token)
        message = parse_message(ai_response)
    
    # Check if AI said to skip
    if message.upper().startswith('SKIP'):
        print("ℹ️ AI returned SKIP — no user-facing updates.")
        return
    
    # Post to Discord
    post_to_discord(discord_webhook, message)

if __name__ == "__main__":
    main()
