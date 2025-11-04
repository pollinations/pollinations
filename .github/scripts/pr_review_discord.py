#!/usr/bin/env python3
"""
Update Announcement Generator for Discord
Analyzes merged PRs and creates user-facing announcements about changes
"""

import os
import sys
import json
import random
import requests
from typing import Dict, List, Optional
from jinja2 import Environment, Template
from datetime import datetime

# Configuration
GITHUB_API_BASE = "https://api.github.com"
POLLINATIONS_API_BASE = "https://enter.pollinations.ai/api/generate/openai"
MODEL = "gemini"
DISCORD_CHAR_LIMIT = 2000
CHUNK_SIZE = 1900  # Leave room for safety

def get_env(key: str, required: bool = True) -> Optional[str]:
    """Get environment variable with optional requirement check"""
    value = os.getenv(key)
    if required and not value:
        print(f"❌ Error: {key} environment variable is required")
        sys.exit(1)
    return value

def github_api_request(endpoint: str, token: str) -> Dict:
    """Make GitHub API request"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }
    
    url = f"{GITHUB_API_BASE}/{endpoint}"
    response = requests.get(url, headers=headers)
    
    if response.status_code != 200:
        print(f"❌ GitHub API error: {response.status_code}")
        print(response.text)
        sys.exit(1)
    
    return response.json()

def get_pr_diff(repo: str, pr_number: str, token: str) -> str:
    """Get PR diff in unified format"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3.diff"
    }
    
    url = f"{GITHUB_API_BASE}/repos/{repo}/pulls/{pr_number}"
    response = requests.get(url, headers=headers)
    
    if response.status_code != 200:
        print(f"❌ Failed to get PR diff: {response.status_code}")
        sys.exit(1)
    
    return response.text

def get_pr_files(repo: str, pr_number: str, token: str) -> List[Dict]:
    """Get list of files changed in PR"""
    endpoint = f"repos/{repo}/pulls/{pr_number}/files"
    return github_api_request(endpoint, token)

def format_diff_for_review(diff_text: str) -> str:
    """
    Format the diff text to match PR-Agent's format with line numbers
    """
    lines = diff_text.split('\n')
    formatted_output = []
    current_file = None
    in_hunk = False
    line_number = 0
    new_hunk_lines = []
    old_hunk_lines = []
    file_status = None
    
    for line in lines:
        if line.startswith('diff --git'):
            # Save previous hunk if exists
            if new_hunk_lines or old_hunk_lines:
                if new_hunk_lines:
                    formatted_output.append("__new hunk__")
                    formatted_output.extend(new_hunk_lines)
                if old_hunk_lines:
                    formatted_output.append("__old hunk__")
                    formatted_output.extend(old_hunk_lines)
                new_hunk_lines = []
                old_hunk_lines = []
            
            # Extract filename - handle both a/ and b/ prefixes
            parts = line.split(' ')
            if len(parts) >= 4:
                # Get the file path from either a/ or b/ prefix
                filename_a = parts[2].replace('a/', '') if parts[2].startswith('a/') else parts[2]
                filename_b = parts[3].replace('b/', '') if parts[3].startswith('b/') else parts[3]
                
                # Determine file status and use appropriate filename
                if filename_a == '/dev/null':
                    filename = filename_b
                    file_status = "ADDED"
                elif filename_b == '/dev/null':
                    filename = filename_a
                    file_status = "DELETED"
                else:
                    filename = filename_b
                    file_status = "MODIFIED"
                
                current_file = filename
                status_emoji = {"ADDED": "➕", "DELETED": "🗑️", "MODIFIED": "📝"}
                formatted_output.append(f"\n## File: '{filename}' {status_emoji.get(file_status, '')}")
                if file_status:
                    formatted_output.append(f"**Status:** {file_status}")
                formatted_output.append("")
        
        elif line.startswith('@@'):
            # Save previous hunk if exists
            if new_hunk_lines or old_hunk_lines:
                if new_hunk_lines:
                    formatted_output.append("__new hunk__")
                    formatted_output.extend(new_hunk_lines)
                if old_hunk_lines:
                    formatted_output.append("__old hunk__")
                    formatted_output.extend(old_hunk_lines)
                new_hunk_lines = []
                old_hunk_lines = []
            
            # Extract line number from hunk header
            formatted_output.append("")
            formatted_output.append(line)
            # Parse line number: @@ -old_start,old_count +new_start,new_count @@
            try:
                if '+' in line:
                    parts = line.split('+')[1].split(',')
                    line_number = int(parts[0]) - 1
                else:
                    line_number = 0
            except:
                line_number = 0
            in_hunk = True
        
        elif in_hunk:
            if line.startswith('+') and not line.startswith('+++'):
                line_number += 1
                new_hunk_lines.append(f"{line_number:2d} {line}")
            elif line.startswith('-') and not line.startswith('---'):
                old_hunk_lines.append(line)
            elif line.startswith(' '):
                line_number += 1
                new_hunk_lines.append(f"{line_number:2d} {line}")
            else:
                # Context line or end of hunk
                if line.strip():
                    line_number += 1
                    new_hunk_lines.append(f"{line_number:2d}  {line}")
    
    # Save last hunk
    if new_hunk_lines or old_hunk_lines:
        if new_hunk_lines:
            formatted_output.append("__new hunk__")
            formatted_output.extend(new_hunk_lines)
        if old_hunk_lines:
            formatted_output.append("__old hunk__")
            formatted_output.extend(old_hunk_lines)
    
    return '\n'.join(formatted_output)

def get_system_prompt() -> str:
    """Return the announcement generation prompt"""
    return """You are a PR Update Announcer for the Pollinations AI Discord community.
Your task is to analyze merged pull requests and create user-facing announcements about what changed.

CRITICAL: You are talking to USERS of the Pollinations AI service, NOT developers!
Users care about: bug fixes, new features, performance improvements, UI changes.
Users DON'T care about: backend refactors, code architecture, database migrations, internal APIs.

IMPORTANT: Pollinations is an open-source AI platform where the community contributes in multiple ways:
1. **Core Platform Changes** - API improvements, new models, infrastructure updates
2. **Community Project Submissions** - Apps, tools, examples, and projects built using Pollinations AI
3. **Documentation & Guides** - Tutorials, examples, API documentation
4. **Infrastructure & DevOps** - Deployment, monitoring, performance improvements

CONTEXTUAL ANALYSIS - Determine the PR type based on file paths and changes:

**CORE PLATFORM CHANGES** (affects all users):
- Files in: `/api/`, `/models/`, `/backend/`, `/frontend/`, `/docker/`, `/kubernetes/`, `/src/`
- Changes to: Rate limits, authentication, model endpoints, API responses, UI
- Announcement focus: What changed for users, bug fixes they'll notice, new features they can use

**COMMUNITY PROJECT SUBMISSIONS** (showcases community creativity):
- Files in: `/projects/`, `/examples/`, `/apps/`, `/tools/`, `/community/`, `/notebooks/`
- New directories with complete applications/tools
- Announcement focus: Celebrate contributor, describe the project, encourage exploration

**DOCUMENTATION UPDATES** (helps users learn):
- Files: `README.md`, `/docs/`, `/guides/`, `/tutorials/`, `.md` files
- Announcement focus: What's easier to understand now, new learning resources

**INFRASTRUCTURE CHANGES** (behind-the-scenes improvements):
- Files: `/deploy/`, `/monitoring/`, `/scripts/`, `docker-compose.yml`, CI/CD files, `.github/`
- Announcement focus: Performance improvements users will notice, reliability improvements

The format we will use to present the PR code diff:
======
## File: 'src/file1.py' 📝
**Status:** MODIFIED

@@ ... @@ def func1():
__new hunk__
11  unchanged code line0
12  unchanged code line1
13 +new code line2 added
14  unchanged code line3
__old hunk__
 unchanged code line0
 unchanged code line1
-old code line2 removed
 unchanged code line3
======

ANALYSIS REQUIREMENTS:

**What to Focus On:**
- Bug fixes users noticed - "Daily pollen refills work now", "Login issues fixed"
- New features users can use - "New model available", "New API endpoint for X"
- Performance improvements users feel - "Faster image generation", "Reduced wait times"
- UI/UX changes - "Better tier display", "Cleaner dashboard"
- Rate limit/quota changes - Very important! Users need to know about these
- Community projects - Celebrate what the community built

**What to Skip:**
- Backend refactoring that doesn't affect users
- Database schema changes (unless they fix a user-facing bug)
- Internal API changes (unless they break existing user integrations)
- Code organization/cleanup
- Test updates (unless they reveal a new feature)
- Environment variable changes (unless users need to update something)
- Developer tooling updates

OUTPUT FORMAT:
Create a concise Discord message with just bullet points - NO headings, NO sections:

```
[One-line summary]

- [Change 1 with emoji]
- [Change 2 with emoji]
- [Change 3 with emoji]

[Optional closing line if needed]
```

FORMAT REQUIREMENTS:
- Start with one-line summary of what changed
- Bullet points only - each with relevant emoji
- Use **bold** for emphasis, `code` for technical terms
- Keep it tight - 150-400 chars total
- Only expand if genuinely major update
- DO NOT include role mentions unless PR description explicitly requests it

EXAMPLE OUTPUTS:

**Example 1 - Bug Fix:**
```
Fixed tier subscription bugs:

- ✅ Daily pollen refills working now
- 🎨 Better tier display in UI
- 🔧 More reliable subscription system
```

**Example 2 - New Feature:**
```
Added wildcard domain support:

- 🌐 Use `*.example.com` for all subdomains
- 🔒 Extra security against domain spoofing
- ⚡ No more adding each subdomain separately
```

**Example 3 - Multiple Changes:**
```
Quick updates:

- 🐛 Fixed login issues
- ⚡ Faster image generation
- 📝 Better error messages
- 🎨 Cleaner dashboard UI
```

The output should be raw Discord message text, not YAML or JSON.
"""

def get_user_prompt(title: str, branch: str, description: str, diff: str) -> str:
    """Return the announcement generation prompt"""
    template = """--Merged PR Information--

Title: '{{ title }}'
Branch: '{{ branch }}'
{% if description and description != "No description provided" %}

PR Description:
======
{{ description }}
======
{% endif %}

The PR code changes:
======
{{ diff }}
======

ANALYSIS TASK:
Analyze these code changes and create a user-facing Discord announcement for the Pollinations AI community.

REMEMBER: You're talking to USERS of the service, NOT developers!

FIRST: Determine the PR type based on file paths:
- **Core Platform** (API/backend/models): Focus on user-visible changes, bug fixes, new features
- **Community Project** (projects/examples/apps): Celebrate contributor, describe the project
- **Documentation** (README/docs/guides): Highlight what's easier to understand now
- **Infrastructure** (deploy/monitoring/CI): Only mention if users will notice performance/reliability improvements

THEN: Focus on USER IMPACT:
1. **What changed for users** - not how it was implemented
2. **Bug fixes they noticed** - "X now works", "Y is fixed"
3. **New features they can use** - be specific about what they can do now
4. **Performance improvements they'll feel** - "faster", "more reliable"
5. **Rate limit/quota changes** - VERY important to mention
6. **UI/UX improvements** - what looks or works better

SKIP:
- Backend refactoring (unless it fixes a user-facing bug)
- Database migrations (unless they improve user experience)
- Internal API changes (unless they break existing integrations)
- Code cleanup/organization
- Developer tooling

LENGTH GUIDANCE:
- **Default**: 150-400 chars (tight bullet points)
- **Only expand** if genuinely major update with multiple significant changes

MENTION HANDLING:
- Check if PR description contains "@mention" or "mention updates" or similar
- If YES: Start message with "Hey <@&1424461167883194418>! "
- If NO: Start directly with the summary (no mention)

Create a concise Discord message (raw text, not YAML/JSON) with:
- One-line summary
- Bullet points with emojis
- NO headings or sections
- Keep it tight and scannable
"""
    
    env = Environment()
    tmpl = env.from_string(template)
    return tmpl.render(
        title=title,
        branch=branch,
        description=description or "No description provided",
        diff=diff
    )

def call_pollinations_api(system_prompt: str, user_prompt: str, token: str) -> str:
    """Call Pollinations AI API with OpenAI-compatible format"""
    # Generate random seed for varied results
    seed = random.randint(0, 2147483647)  # int32 max
    
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
        "temperature": 0.2,
        "seed": seed
    }
    
    print(f"🤖 Calling Pollinations AI API with model: {MODEL}, seed: {seed}")
    
    response = requests.post(
        f"{POLLINATIONS_API_BASE}/chat/completions",
        headers=headers,
        json=payload,
        timeout=120
    )
    
    if response.status_code != 200:
        print(f"❌ Pollinations API error: {response.status_code}")
        print(response.text)
        sys.exit(1)
    
    result = response.json()
    return result['choices'][0]['message']['content']

def parse_discord_message(response: str) -> str:
    """Parse Discord message from AI response"""
    print(f"DEBUG: Raw AI response length: {len(response)}")
    print(f"DEBUG: First 200 chars: {response[:200]}")
    
    # Clean up the response - remove any markdown code blocks if present
    message = response.strip()
    
    # Remove markdown code block markers if present
    if message.startswith('```'):
        lines = message.split('\n')
        # Remove first line if it's just ```
        if lines[0].strip() == '```' or lines[0].startswith('```'):
            lines = lines[1:]
        # Remove last line if it's just ```
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        message = '\n'.join(lines)
    
    print(f"DEBUG: Cleaned message length: {len(message)}")
    
    return message

def format_timestamp(merged_at: str) -> str:
    """Format ISO timestamp as Discord timestamp (Unix epoch)"""
    if not merged_at:
        return "unknown time"
    
    try:
        # Handle both formats: with and without 'Z'
        if merged_at.endswith('Z'):
            dt = datetime.fromisoformat(merged_at.replace('Z', '+00:00'))
        else:
            dt = datetime.fromisoformat(merged_at)
        
        # Convert to Unix timestamp for Discord formatting
        unix_timestamp = int(dt.timestamp())
        
        # Return Discord timestamp format with :F (full date and time)
        return f"<t:{unix_timestamp}:F>"
    except Exception as e:
        print(f"⚠️ Warning: Could not parse timestamp '{merged_at}': {e}")
        return "unknown time"

def chunk_message(message: str, max_length: int = CHUNK_SIZE) -> List[str]:
    """
    Split message into chunks at appropriate breakpoints.
    Tries to split at paragraph breaks, then line breaks, then hard cuts.
    """
    if len(message) <= max_length:
        return [message]
    
    chunks = []
    remaining = message
    
    while remaining:
        if len(remaining) <= max_length:
            chunks.append(remaining)
            break
        
        # Find the best split point
        chunk = remaining[:max_length]
        split_point = max_length
        
        # Try to split at paragraph break (double newline)
        last_para = chunk.rfind('\n\n')
        if last_para > max_length * 0.5:  # Only if it's past halfway
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
        
        # Add the chunk
        chunks.append(remaining[:split_point].rstrip())
        remaining = remaining[split_point:].lstrip()
    
    return chunks

def format_review_for_discord(message_content: str, pr_info: Dict) -> List[Dict]:
    """
    Format announcement message for Discord webhook.
    Returns a list of payloads if message needs to be chunked.
    """
    time_str = format_timestamp(pr_info.get('merged_at'))
    
    # Create Discord markdown links with angle brackets to suppress embeds
    pr_link = f"[PR #{pr_info['number']}](<{pr_info['url']}>)"
    author_link = f"[{pr_info['author']}](<https://github.com/{pr_info['author']}>)"
    
    footer = f"\n\n{pr_link} • Merged by {author_link} • {time_str}"
    
    # Calculate available space for content
    footer_length = len(footer)
    available_space = CHUNK_SIZE - footer_length
    
    # Check if we need to chunk
    if len(message_content) <= available_space:
        # Single message - add footer
        full_message = message_content + footer
        return [{"content": full_message}]
    
    # Need to chunk - split the message content
    print(f"📦 Message is {len(message_content)} chars, chunking into ~{CHUNK_SIZE} char pieces...")
    chunks = chunk_message(message_content, available_space)
    
    payloads = []
    total_chunks = len(chunks)
    
    for i, chunk in enumerate(chunks):
        is_last = (i == total_chunks - 1)
        
        if is_last:
            # Last chunk gets the footer
            full_message = chunk + footer
        else:
            # Non-last chunks are sent as-is without any continuation indicator
            full_message = chunk
        
        payloads.append({"content": full_message})
        print(f"  📄 Chunk {i+1}/{total_chunks}: {len(full_message)} chars")
    
    return payloads

def post_to_discord(webhook_url: str, payloads: List[Dict]):
    """Post message(s) to Discord webhook"""
    import time
    
    for i, payload in enumerate(payloads):
        if i > 0:
            # Add small delay between messages to ensure correct ordering
            time.sleep(0.5)
        
        response = requests.post(webhook_url, json=payload)
        
        if response.status_code not in [200, 204]:
            print(f"❌ Discord webhook error on message {i+1}: {response.status_code}")
            print(response.text)
            sys.exit(1)
        
        print(f"✅ Successfully posted message {i+1}/{len(payloads)} to Discord!")

def main():
    print("🚀 Starting Update Announcement Generator...")
    
    # Get environment variables
    github_token = get_env('GITHUB_TOKEN')
    
    # Check for POLLINATIONS_TOKEN_DCPRS first, fallback to POLLINATIONS_TOKEN
    pollinations_token = os.getenv('POLLINATIONS_TOKEN_DCPRS')
    if pollinations_token:
        print("🔑 Using POLLINATIONS_TOKEN_DCPRS")
    else:
        pollinations_token = get_env('POLLINATIONS_TOKEN')
        print("🔑 Using POLLINATIONS_TOKEN")
    
    discord_webhook = get_env('DISCORD_WEBHOOK_URL')
    pr_number = get_env('PR_NUMBER')
    repo_full_name = get_env('REPO_FULL_NAME')
    pr_title = get_env('PR_TITLE')
    pr_url = get_env('PR_URL')
    pr_author = get_env('PR_AUTHOR')
    pr_branch = get_env('PR_BRANCH')
    
    print(f"📝 Reviewing PR #{pr_number} in {repo_full_name}")
    print(f"🔗 {pr_url}")
    
    # Get PR details
    pr_data = github_api_request(f"repos/{repo_full_name}/pulls/{pr_number}", github_token)
    pr_description = pr_data.get('body', '')
    merged_at = pr_data.get('merged_at', '')
    
    # Get PR diff
    print("📥 Fetching PR diff...")
    diff_raw = get_pr_diff(repo_full_name, pr_number, github_token)
    
    # Format diff for review
    print("🔄 Formatting diff...")
    diff_formatted = format_diff_for_review(diff_raw)
    
    # Prepare prompts
    print("📋 Preparing review prompts...")
    system_prompt = get_system_prompt()
    user_prompt = get_user_prompt(pr_title, pr_branch, pr_description, diff_formatted)
    
    # Get AI announcement
    print("🤖 Generating update announcement...")
    ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
    
    # Parse response
    print("📊 Parsing announcement message...")
    try:
        message_content = parse_discord_message(ai_response)
    except Exception as e:
        print(f"❌ Error parsing message: {e}")
        print(f"Raw AI response:\n{ai_response}")
        raise
    
    # Format for Discord
    print("💬 Formatting announcement for Discord...")
    pr_info = {
        'title': pr_title,
        'number': pr_number,
        'url': pr_url,
        'author': pr_author,
        'merged_at': merged_at
    }
    
    try:
        discord_payloads = format_review_for_discord(message_content, pr_info)
    except Exception as e:
        print(f"❌ Error formatting for Discord: {e}")
        print(f"Message content: {message_content}")
        raise
    
    # Post to Discord
    print(f"📤 Posting {len(discord_payloads)} message(s) to Discord...")
    post_to_discord(discord_webhook, discord_payloads)
    
    print("✨ Done!")

if __name__ == "__main__":
    main()