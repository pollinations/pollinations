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
    
    since_date = since_time.isoformat()
    
    url = f"{GITHUB_API_BASE}/repos/{repo}/pulls"
    params = {
        "state": "closed",
        "sort": "updated",
        "direction": "desc",
        "per_page": 50
    }
    
    print(f"🔍 Fetching merged PRs from {repo} since {since_time.strftime('%Y-%m-%d %H:%M:%S')} UTC...")
    response = requests.get(url, headers=headers, params=params)
    
    if response.status_code != 200:
        print(f"❌ GitHub API error: {response.status_code}")
        print(response.text)
        sys.exit(1)
    
    all_prs = response.json()
    print(f"🔍 Retrieved {len(all_prs)} total closed PRs")
    
    # Filter for merged PRs after the cutoff time
    merged_prs = []
    skipped_prs = []
    
    for pr in all_prs:
        pr_number = pr.get('number', 0)
        merged_at = pr.get('merged_at')
        
        if merged_at:
            merged_time = datetime.fromisoformat(merged_at.replace('Z', '+00:00'))
            if merged_time > since_time:
                merged_prs.append({
                    'number': pr_number,
                    'title': pr.get('title', 'No title'),
                    'body': pr.get('body', 'No description'),
                    'author': pr.get('user', {}).get('login', 'Unknown'),
                    'merged_at': merged_at,
                    'url': pr.get('html_url', '#')
                })
                print(f"   ✅ Including PR #{pr_number} (merged {merged_time.strftime('%Y-%m-%d %H:%M:%S')})")
            else:
                skipped_prs.append(pr_number)
                print(f"   ⏭️ Skipping PR #{pr_number} (merged {merged_time.strftime('%Y-%m-%d %H:%M:%S')} - before cutoff)")
    
    # Sort by PR number (ascending)
    merged_prs.sort(key=lambda x: x['number'])
    
    print(f"📊 Result: {len(merged_prs)} new PRs, {len(skipped_prs)} already covered")
    if merged_prs:
        print(f"   New PRs: #{merged_prs[0]['number']} to #{merged_prs[-1]['number']}")
    if skipped_prs:
        print(f"   Skipped PRs: {skipped_prs[:5]}{'...' if len(skipped_prs) > 5 else ''}")
    
    return merged_prs

def get_last_digest_time(repo: str, token: str) -> datetime:
    """Get the time of the last successful digest run"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json"
    }
    
    current_run_id = os.getenv('GITHUB_RUN_ID')
    current_time = datetime.now(timezone.utc)
    
    try:
        # Get recent workflow runs for this specific workflow
        url = f"{GITHUB_API_BASE}/repos/{repo}/actions/workflows/discord_digest.yml/runs"
        params = {"per_page": 20}  # Get more runs to be thorough
        
        print(f"🔍 Checking workflow runs at: {url}")
        print(f"🔍 Current run ID: {current_run_id}")
        
        response = requests.get(url, headers=headers, params=params)
        if response.status_code == 200:
            runs = response.json().get('workflow_runs', [])
            
            print(f"🔍 Found {len(runs)} total workflow runs")
            
            # Filter for successful runs, excluding current run
            successful_runs = []
            for run in runs:
                run_id = str(run.get('id', ''))
                run_status = run.get('status')
                run_conclusion = run.get('conclusion')
                run_date = datetime.fromisoformat(run['created_at'].replace('Z', '+00:00'))
                
                print(f"   Run {run_id}: {run_status}/{run_conclusion} at {run_date.strftime('%Y-%m-%d %H:%M:%S')}")
                
                # Skip current run
                if current_run_id and run_id == current_run_id:
                    print(f"   ⏭️ Skipping current run {run_id}")
                    continue
                
                # Only consider completed successful runs
                if (run_status == 'completed' and 
                    run_conclusion == 'success' and
                    (current_time - run_date).total_seconds() > 60):  # At least 1 minute old
                    successful_runs.append(run_date)
                    print(f"   ✅ Valid previous run found at {run_date.strftime('%Y-%m-%d %H:%M:%S')}")
                elif run_status == 'completed' and run_conclusion == 'success':
                    age_seconds = (current_time - run_date).total_seconds()
                    print(f"   ⏰ Recent successful run (only {age_seconds:.0f}s old) - too recent")
                else:
                    print(f"   ❌ Not a completed successful run")
            
            if successful_runs:
                # Get the most recent successful run
                last_run = max(successful_runs)
                print(f"📋 Using last successful digest at {last_run.strftime('%Y-%m-%d %H:%M:%S')} UTC")
                return last_run
            else:
                print("📋 No previous successful runs found (or all too recent)")
                
                # Fallback: if we have any successful runs but they're all recent, use the most recent one anyway
                all_successful = []
                for run in runs:
                    if (run.get('status') == 'completed' and 
                        run.get('conclusion') == 'success'):
                        run_date = datetime.fromisoformat(run['created_at'].replace('Z', '+00:00'))
                        run_id = str(run.get('id', ''))
                        
                        # Skip current run if we can identify it
                        if current_run_id and run_id == current_run_id:
                            continue
                            
                        all_successful.append(run_date)
                
                if all_successful:
                    last_run = max(all_successful)
                    print(f"📋 Using most recent successful run (fallback): {last_run.strftime('%Y-%m-%d %H:%M:%S')} UTC")
                    return last_run
        else:
            print(f"❌ Failed to get workflow runs: {response.status_code}")
            print(f"Response: {response.text}")
                        
    except Exception as e:
        print(f"⚠️ Could not determine last digest time: {e}")
    
    # Fallback based on day of week for scheduled runs
    now = datetime.now(timezone.utc)
    if now.weekday() == 0:  # Monday
        # Cover since last Friday
        days_back = 3 if now.hour >= 12 else 4
    elif now.weekday() == 4:  # Friday  
        # Cover since last Monday
        days_back = 4 if now.hour >= 12 else 5
    else:
        # Other days, use 3 days
        days_back = 3
    
    fallback_time = now - timedelta(days=days_back)
    print(f"📋 Using smart fallback: covering PRs since {fallback_time.strftime('%Y-%m-%d %H:%M:%S')} UTC ({days_back} days back)")
    return fallback_time

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
    
    print(f"🤖 Generating digest with {MODEL}")
    
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

def post_to_discord(webhook_url: str, message: str):
    """Post message to Discord"""
    payload = {"content": message}
    response = requests.post(webhook_url, json=payload)
    
    if response.status_code not in [200, 204]:
        print(f"❌ Discord error: {response.status_code}")
        print(response.text)
        sys.exit(1)
    
    print("✅ Posted digest to Discord!")

def main():
    print("🚀 Generating Simple Weekly Digest...")
    
    # Get environment variables
    github_token = get_env('GITHUB_TOKEN')
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    discord_webhook = os.getenv('DISCORD_WEBHOOK_DIGEST') or get_env('DISCORD_WEBHOOK_URL')
    repo_name = get_env('REPO_FULL_NAME')
    
    # Get last digest time to avoid duplicates
    last_digest_time = get_last_digest_time(repo_name, github_token)
    
    # Get recent merged PRs
    merged_prs = get_recent_merged_prs(repo_name, github_token, last_digest_time)
    
    if not merged_prs:
        print("📭 No new PRs to cover, skipping digest")
        return
    
    print(f"📝 Creating digest for PRs #{merged_prs[0]['number']} to #{merged_prs[-1]['number']}")
    
    # Create AI prompt
    system_prompt, user_prompt = create_digest_prompt(merged_prs)
    
    # Generate digest
    ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
    message = parse_message(ai_response)
    
    # Check if AI said to skip
    if message.upper().startswith('SKIP'):
        print("📭 AI determined no user-facing changes, skipping post")
        return
    
    # Post to Discord
    print("📤 Posting to Discord...")
    post_to_discord(discord_webhook, message)
    
    print(f"✨ Digest posted! Covered {len(merged_prs)} PRs")

if __name__ == "__main__":
    main()