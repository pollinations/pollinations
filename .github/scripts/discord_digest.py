#!/usr/bin/env python3
"""
Weekly Digest Generator
Collects all PR summaries and creates a combined weekly update for Discord
Handles large volumes with chunking and summarization strategies
"""

import os
import sys
import json
import glob
import random
import requests
from typing import Dict, List, Tuple
from datetime import datetime, timedelta

# Configuration
POLLINATIONS_API_BASE = "https://enter.pollinations.ai/api/generate/openai"
MODEL = "gemini"
DISCORD_CHAR_LIMIT = 2000
CHUNK_SIZE = 1900

# Token limits (updated for 128k token window)
MAX_INPUT_TOKENS = 120000  # Leave room for system prompt and response
CHARS_PER_TOKEN = 4  # Average characters per token
MAX_INPUT_CHARS = MAX_INPUT_TOKENS * CHARS_PER_TOKEN

def get_env(key: str, required: bool = True) -> str:
    """Get environment variable"""
    value = os.getenv(key)
    if required and not value:
        print(f"❌ Error: {key} environment variable is required")
        sys.exit(1)
    return value

def load_pr_summaries() -> List[Dict]:
    """Load all PR summaries from the summaries directory"""
    summaries_dir = ".pr-summaries"
    
    if not os.path.exists(summaries_dir):
        print(f"📭 No summaries directory found")
        return []
    
    summary_files = glob.glob(f"{summaries_dir}/pr_*.json")
    
    if not summary_files:
        print(f"📭 No PR summaries found")
        return []
    
    summaries = []
    for file_path in summary_files:
        try:
            with open(file_path, 'r') as f:
                summary = json.load(f)
                summaries.append(summary)
        except Exception as e:
            print(f"⚠️ Warning: Could not load {file_path}: {e}")
    
    # Sort by impact (high first) and then by PR number
    impact_order = {'high': 0, 'medium': 1, 'low': 2}
    summaries.sort(key=lambda x: (
        impact_order.get(x.get('impact', 'medium'), 1),
        -x.get('pr_number', 0)
    ))
    
    print(f"📊 Loaded {len(summaries)} PR summaries")
    return summaries

def estimate_prompt_size(summaries: List[Dict]) -> int:
    """Estimate the size of the prompt in characters"""
    total = 0
    for summary in summaries:
        # Estimate based on JSON size
        total += len(json.dumps(summary))
        total += 100  # Add overhead for formatting
    return total

def filter_summaries_by_impact(summaries: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
    """
    Filter summaries by impact level.
    Returns (high_priority, low_priority) tuple.
    """
    high_priority = []
    low_priority = []
    
    for summary in summaries:
        impact = summary.get('impact', 'medium')
        if impact == 'high':
            high_priority.append(summary)
        elif impact == 'medium':
            high_priority.append(summary)
        else:  # low impact
            low_priority.append(summary)
    
    return high_priority, low_priority

def create_condensed_summary(summaries: List[Dict]) -> List[Dict]:
    """
    Create ultra-condensed versions of summaries for very large batches.
    Keeps only essential info.
    """
    condensed = []
    for s in summaries:
        condensed.append({
            'pr_number': s['pr_number'],
            'pr_title': s['pr_title'][:80],  # Truncate title
            'category': s.get('category', 'core'),
            'impact': s.get('impact', 'medium'),
            'summary': s.get('summary', '')[:150],  # Truncate summary
            'pr_author': s['pr_author']
        })
    return condensed

def batch_summaries(summaries: List[Dict], max_chars: int) -> List[List[Dict]]:
    """
    Split summaries into batches that fit within token limits.
    Returns list of batches.
    """
    batches = []
    current_batch = []
    current_size = 0
    
    for summary in summaries:
        # Estimate size of this summary
        summary_size = len(json.dumps(summary)) + 100
        
        # If adding this would exceed limit, start new batch
        if current_size + summary_size > max_chars and current_batch:
            batches.append(current_batch)
            current_batch = []
            current_size = 0
        
        current_batch.append(summary)
        current_size += summary_size
    
    # Add last batch
    if current_batch:
        batches.append(current_batch)
    
    return batches

def get_digest_system_prompt(is_condensed: bool = False) -> str:
    """Return the weekly digest generation prompt"""
    if is_condensed:
        return """You are creating a CONDENSED weekly digest for Pollinations AI Discord.
You're receiving a LARGE number of PRs, so keep descriptions VERY brief.

OUTPUT FORMAT:
```
[Natural greeting mentioning <@&1424461167883194418>]

## 🌸 Weekly Update - [Date]

### 🚀 Highlights
- Brief description of most important change
- Another key improvement or feature
- Critical bug fix or enhancement

### 📦 Other Updates
- {N} additional improvements across core platform
- Bug fixes and performance optimizations
- Documentation and community contributions

Thanks to our amazing contributors! 🎉

---
**Total PRs merged:** {N}
**PRs merged:** [#123](<url>), [#456](<url>), [#789](<url>) (+{N} more)
**Contributors:** [@user1](<github-url>), [@user2](<github-url>), [@user3](<github-url>)
```

CRITICAL RULES:
- Start with a natural, varied greeting that mentions <@&1424461167883194418>
- Focus on WHAT changed, not WHO changed it in main content
- Max 3-5 highlights (highest impact only)
- Group similar changes naturally
- All PR numbers and contributors go in footer
- TOTAL LENGTH: 400-800 characters
- Use angle brackets <> around all URLs
- Each contributor should appear ONLY ONCE in the contributors list
"""
    
    return """You are creating a weekly digest for the Pollinations AI Discord community.
You'll receive summaries of multiple merged PRs and need to create ONE cohesive update message.

CONTEXT: Pollinations is an open-source AI platform serving a community of users and contributors.

YOUR TASK: Create a clean, engaging weekly update that focuses on WHAT changed, not cluttered with WHO/WHERE details.

NEW CLEAN FORMAT:
```
[Natural greeting mentioning <@&1424461167883194418>]

## 🌸 Weekly Update - [Date]

### 🚀 New Features
- Brief description of new capability or feature
- Another feature or enhancement added
- Major improvement users will notice

### 🐛 Fixes & Improvements
- Bug that was resolved (user impact)
- Performance improvement or optimization
- Better error handling or reliability fix

### 🌐 Community Contributions
- New tool, example, or integration added
- Documentation or tutorial improvements
- SDK or library enhancements

Thanks to our amazing contributors! 🎉

---
**Total PRs merged:** {N}
**PRs merged:** [#123](<url>), [#456](<url>), [#789](<url>), [#101](<url>)
**Contributors:** [@alice](<github-url>), [@bob](<github-url>), [@charlie](<github-url>)
```

CRITICAL FORMATTING RULES:
- Start with a natural, varied greeting that mentions <@&1424461167883194418>
- Main content focuses on WHAT changed (user impact)
- NO inline PR numbers or author mentions in bullet points
- Group related changes naturally under logical sections
- All metadata (PR numbers, contributors) goes in footer
- Use angle brackets <> around ALL URLs to prevent embeds
- Keep bullet points concise and user-focused
- Each contributor should appear ONLY ONCE in the contributors list

GROUPING STRATEGY:
- **🚀 New Features** - New capabilities, major additions
- **🐛 Fixes & Improvements** - Bug fixes, performance, reliability
- **🌐 Community Contributions** - Tools, examples, docs, SDKs
- **📚 Documentation** - Guides, tutorials (if significant)
- **🔧 Infrastructure** - Only if user-visible impact

TONE & LENGTH:
- Conversational and appreciative
- Focus on user benefits
- 600-1200 characters total
- If single PR has multiple changes, combine them naturally
- If 8+ PRs, group minor ones as "Additional improvements"

If NO user-facing changes, DO NOT send any message at all.
"""

def get_digest_user_prompt(summaries: List[Dict], date_str: str, is_condensed: bool = False) -> str:
    """Create user prompt with all PR summaries"""
    if not summaries:
        return "No PR summaries to process."
    
    # Group by category and impact
    grouped = {
        'high': {'core': [], 'community': [], 'docs': [], 'infrastructure': []},
        'medium': {'core': [], 'community': [], 'docs': [], 'infrastructure': []},
        'low': {'core': [], 'community': [], 'docs': [], 'infrastructure': []}
    }
    
    for summary in summaries:
        impact = summary.get('impact', 'medium')
        category = summary.get('category', 'core')
        grouped[impact][category].append(summary)
    
    prompt = f"Create a weekly digest for {date_str}.\n\n"
    prompt += f"Total PRs merged: {len(summaries)}\n"
    
    if is_condensed:
        prompt += "\n⚠️ LARGE BATCH: Keep it VERY concise!\n"
    
    prompt += "\n"
    
    # Add summaries by priority (high first)
    for impact in ['high', 'medium', 'low']:
        items = []
        for category in ['core', 'community', 'docs', 'infrastructure']:
            items.extend(grouped[impact][category])
        
        if items:
            prompt += f"\n=== {impact.upper()} IMPACT ({len(items)} PRs) ===\n"
            for item in items:
                prompt += f"\n**PR #{item['pr_number']}** - {item['pr_title']}\n"
                prompt += f"Category: {item['category']}\n"
                prompt += f"Summary: {item['summary']}\n"
                if not is_condensed and item.get('details'):
                    prompt += "Details:\n"
                    for detail in item['details']:
                        prompt += f"  - {detail}\n"
                prompt += f"Author: {item['pr_author']}\n"
                prompt += f"PR URL: {item['pr_url']}\n"
    
    prompt += f"\n\nCreate a clean weekly digest focusing on WHAT changed (user impact)."
    prompt += f"\nCombine related changes naturally. Put all PR numbers and contributors in the footer."
    prompt += f"\nGenerate PR links as [#123](<{summaries[0]['pr_url'].split('/pull/')[0]}/pull/123>) format."
    prompt += f"\nGenerate contributor links as [@username](<https://github.com/username>) format."
    
    if is_condensed:
        prompt += "\nRemember: VERY brief, prioritize highest impact items only."
    
    return prompt

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
    
    print(f"🤖 Generating weekly digest with {MODEL}")
    
    response = requests.post(
        f"{POLLINATIONS_API_BASE}/chat/completions",
        headers=headers,
        json=payload,
        timeout=120
    )
    
    if response.status_code != 200:
        print(f"❌ API error: {response.status_code}")
        print(response.text)
        sys.exit(1)
    
    result = response.json()
    return result['choices'][0]['message']['content']

def parse_discord_message(response: str) -> str:
    """Parse Discord message from AI response"""
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

def chunk_message(message: str, max_length: int = CHUNK_SIZE) -> List[str]:
    """Split message into chunks at appropriate breakpoints"""
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
        
        # Try paragraph break
        last_para = chunk.rfind('\n\n')
        if last_para > max_length * 0.5:
            split_point = last_para + 2
        else:
            # Try line break
            last_line = chunk.rfind('\n')
            if last_line > max_length * 0.5:
                split_point = last_line + 1
            else:
                # Try space
                last_space = chunk.rfind(' ')
                if last_space > max_length * 0.5:
                    split_point = last_space + 1
        
        chunks.append(remaining[:split_point].rstrip())
        remaining = remaining[split_point:].lstrip()
    
    return chunks

def post_to_discord(webhook_url: str, message: str):
    """Post message to Discord webhook"""
    import time
    
    chunks = chunk_message(message)
    
    for i, chunk in enumerate(chunks):
        if i > 0:
            time.sleep(0.5)
        
        payload = {"content": chunk}
        response = requests.post(webhook_url, json=payload)
        
        if response.status_code not in [200, 204]:
            print(f"❌ Discord error on chunk {i+1}: {response.status_code}")
            print(response.text)
            sys.exit(1)
        
        print(f"✅ Posted chunk {i+1}/{len(chunks)} to Discord")

def generate_multi_batch_digest(batches: List[List[Dict]], date_str: str, token: str) -> str:
    """
    Generate digest from multiple batches by creating sub-summaries first,
    then combining them into final digest.
    """
    print(f"📦 Processing {len(batches)} batches separately...")
    
    batch_summaries = []
    
    for i, batch in enumerate(batches):
        print(f"   Processing batch {i+1}/{len(batches)} ({len(batch)} PRs)...")
        
        # Create condensed version for this batch
        system_prompt = get_digest_system_prompt(is_condensed=True)
        user_prompt = get_digest_user_prompt(batch, date_str, is_condensed=True)
        
        response = call_pollinations_api(system_prompt, user_prompt, token)
        batch_summary = parse_discord_message(response)
        batch_summaries.append(batch_summary)
    
    # Now combine all batch summaries into final digest
    print("🔗 Combining batch summaries into final digest...")
    
    combine_prompt = f"""You have {len(batches)} sub-summaries of PRs merged on {date_str}.
Combine them into ONE cohesive weekly digest.

Sub-summaries:
"""
    
    for i, summary in enumerate(batch_summaries):
        combine_prompt += f"\n--- Batch {i+1} ---\n{summary}\n"
    
    combine_prompt += """

Create a single unified weekly digest that:
- Starts with "Hey <@&1424461167883194418>!"
- Groups similar changes together
- Highlights the most important updates
- Keeps it concise (800-1200 chars)
- Maintains friendly tone
"""
    
    system_prompt = "You are combining multiple batch summaries into one cohesive weekly digest for Discord."
    
    final_response = call_pollinations_api(system_prompt, combine_prompt, token)
    return parse_discord_message(final_response)

def main():
    print("🚀 Generating Weekly Digest...")
    
    # Get environment variables
    pollinations_token = get_env('POLLINATIONS_TOKEN_DCPRS')
    discord_webhook = os.getenv('DISCORD_WEBHOOK_DIGEST') or get_env('DISCORD_WEBHOOK_URL')
    repo_name = get_env('REPO_FULL_NAME')
    
    # Load all PR summaries
    summaries = load_pr_summaries()
    
    if not summaries:
        print("📭 No PRs merged this week, skipping digest")
        return
    
    print(f"📊 Processing {len(summaries)} PRs...")
    
    # Get date string (covering last week)
    today = datetime.utcnow()
    week_ago = today - timedelta(days=7)
    date_str = f"{week_ago.strftime('%B %d')} - {today.strftime('%B %d, %Y')}"
    
    # Strategy 1: Try with all summaries if reasonable size
    estimated_size = estimate_prompt_size(summaries)
    print(f"📏 Estimated prompt size: {estimated_size:,} chars")
    
    if estimated_size < MAX_INPUT_CHARS:
        print("✅ Summaries fit in single batch")
        
        # Generate normal digest
        system_prompt = get_digest_system_prompt(is_condensed=len(summaries) > 15)
        user_prompt = get_digest_user_prompt(summaries, date_str, is_condensed=len(summaries) > 15)
        
        ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
        message = parse_discord_message(ai_response)
    
    else:
        print(f"⚠️ Prompt too large! Applying reduction strategies...")
        
        # Strategy 2: Filter by impact (drop low-impact items)
        high_priority, low_priority = filter_summaries_by_impact(summaries)
        
        print(f"   High/Medium priority: {len(high_priority)} PRs")
        print(f"   Low priority: {len(low_priority)} PRs")
        
        # Try with just high priority
        high_priority_size = estimate_prompt_size(high_priority)
        
        if high_priority_size < MAX_INPUT_CHARS:
            print("✅ Using high/medium priority PRs only")
            
            system_prompt = get_digest_system_prompt(is_condensed=True)
            user_prompt = get_digest_user_prompt(high_priority, date_str, is_condensed=True)
            user_prompt += f"\n\nNote: {len(low_priority)} additional low-impact PRs were merged (internal changes, minor fixes)."
            
            ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
            message = parse_discord_message(ai_response)
        
        else:
            print("⚠️ Still too large! Using batch processing...")
            
            # Strategy 3: Batch processing with condensed summaries
            condensed = create_condensed_summary(high_priority)
            batches = batch_summaries(condensed, MAX_INPUT_CHARS // 2)
            
            print(f"   Split into {len(batches)} batches")
            
            if len(batches) == 1:
                # Single batch with condensed data
                system_prompt = get_digest_system_prompt(is_condensed=True)
                user_prompt = get_digest_user_prompt(batches[0], date_str, is_condensed=True)
                
                ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
                message = parse_discord_message(ai_response)
            else:
                # Multiple batches - need hierarchical summarization
                message = generate_multi_batch_digest(batches, date_str, pollinations_token)
            
            # Add note about volume
            total_skipped = len(low_priority)
            if total_skipped > 0:
                message += f"\n\n_Plus {total_skipped} additional minor updates and internal improvements._"
    
    # Check if it's a skip message
    if "no user-facing updates" in message.lower() and len(summaries) == 0:
        print("📭 Only internal changes this week, skipping post")
        return
    
    # The footer is now handled by the AI prompt, but add fallback link
    pr_count = len(summaries)
    if "_View all changes:" not in message and "**PRs merged:**" not in message:
        message += f"\n\n_View all changes: <https://github.com/{repo_name}/pulls?q=is:pr+is:merged>_"
    
    # Post to Discord
    print("📤 Posting to Discord...")
    post_to_discord(discord_webhook, message)
    
    print(f"✨ Weekly digest posted! ({pr_count} PRs processed)")

if __name__ == "__main__":
    main()
