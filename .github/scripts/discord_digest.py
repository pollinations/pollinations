#!/usr/bin/env python3
"""
Simple Weekly Digest Generator
Gets recent merged PRs and creates a weekly digest in one AI call
No temp storage, no complexity - just simple and direct
"""

import os
import sys
import json
import random
import requests
from typing import Dict, List
from datetime import datetime, timedelta, timezone

# Configuration
GITHUB_API_BASE = "https://api.github.com"
POLLINATIONS_API_BASE = "https://enter.pollinations.ai/api/generate/openai"
MODEL = "openai-large"

def get_env(key: str, required: bool = True) -> str:
    """Get environment variable"""
    value = os.getenv(key)
    if required and not value:
        print(f"❌ Error: {key} environment variable is required")
        sys.exit(1)
    return value

def get_recent_merged_prs(repo: str, token: str, since_time: datetime) -> List[Dict]:
    """Get recently merged PRs since last digest"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }
    
    url = f"{GITHUB_API_BASE}/repos/{repo}/pulls"
    params = {
        "state": "closed",
        "sort": "updated",
        "direction": "desc",
        "per_page": 50
    }
    
    response = requests.get(url, headers=headers, params=params)
    
    if response.status_code != 200:
        print(f"❌ GitHub API error: {response.status_code}")
        sys.exit(1)
    
    all_prs = response.json()
    
    # Filter for merged PRs after the cutoff time
    merged_prs = []
    for pr in all_prs:
        merged_at = pr.get('merged_at')
        if merged_at:
            merged_time = datetime.fromisoformat(merged_at.replace('Z', '+00:00'))
            if merged_time > since_time:
                merged_prs.append({
                    'number': pr.get('number', 0),
                    'title': pr.get('title', 'No title'),
                    'body': pr.get('body', 'No description'),
                    'author': pr.get('user', {}).get('login', 'Unknown'),
                    'merged_at': merged_at,
                    'url': pr.get('html_url', '#')
                })
    
    # Sort by PR number (ascending)
    merged_prs.sort(key=lambda x: x['number'])
    return merged_prs

def get_last_digest_time() -> datetime:
    """Get the time of the last digest based on the fixed Monday/Friday schedule"""
    now = datetime.now(timezone.utc)
    current_weekday = now.weekday()  # 0=Monday, 4=Friday
    
    if current_weekday == 0:  # Monday
        # Last digest was Friday at 12:00 UTC
        days_back = 3
        last_digest = now.replace(hour=12, minute=0, second=0, microsecond=0) - timedelta(days=days_back)
    elif current_weekday == 4:  # Friday  
        # Last digest was Monday at 12:00 UTC
        days_back = 4
        last_digest = now.replace(hour=12, minute=0, second=0, microsecond=0) - timedelta(days=days_back)
    else:
        # Other days - cover last 3 days
        last_digest = now - timedelta(days=3)
    
    return last_digest

def create_digest_prompt(prs: List[Dict]) -> str:
    """Create the AI prompt with all PR data"""
    if not prs:
        return ""
    
    # Calculate date range
    today = datetime.now(timezone.utc)
    week_ago = today - timedelta(days=4)  # Cover last few days
    
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
    
    # Remove markdown code blocks if present
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
        
        # Try to split at paragraph break (double newline)
        last_para = chunk.rfind('\n\n')
        if last_para > max_length * 0.5:
            split_point = last_para + 2
        else:
            # Try to split at line break
            last_line = chunk.rfind('\n')
            if last_line > max_length * 0.5:
                split_point = last_line + 1
            else:
                # Try to split at space
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
            # Small delay between chunks to ensure proper ordering
            import time
            time.sleep(0.5)
        
        payload = {"content": chunk}
        response = requests.post(webhook_url, json=payload)
        
        if response.status_code not in [200, 204]:
            print(f"❌ Discord error: {response.status_code}")
            print(response.text)
            sys.exit(1)
    


def main():
    # Get environment variables
    github_token = get_env('GITHUB_TOKEN')
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    discord_webhook = os.getenv('DISCORD_WEBHOOK_DIGEST') or get_env('DISCORD_WEBHOOK_URL')
    repo_name = get_env('REPO_FULL_NAME')
    
    # Get last digest time based on schedule
    last_digest_time = get_last_digest_time()
    
    # Get recent merged PRs
    merged_prs = get_recent_merged_prs(repo_name, github_token, last_digest_time)
    
    if not merged_prs:
        return
    
    # Create AI prompt
    system_prompt, user_prompt = create_digest_prompt(merged_prs)
    
    # Generate digest
    ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
    message = parse_message(ai_response)
    
    # Check if AI said to skip
    if message.upper().startswith('SKIP'):
        return
    
    # Post to Discord
    post_to_discord(discord_webhook, message)

if __name__ == "__main__":
    main()
