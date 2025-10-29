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

# Configuration
GITHUB_API_BASE = "https://api.github.com"
POLLINATIONS_API_BASE = "https://text.pollinations.ai/openai"
MODEL = "gemini"

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
    return """You are a PR Review Analyst for Pollinations AI platform Discord community.
Your task is to analyze merged pull requests and create comprehensive user-facing announcements about what changed.

IMPORTANT: Pollinations is an open-source AI platform where the community contributes in multiple ways:
1. **Core Platform Changes** - API improvements, new models, infrastructure updates
2. **Community Project Submissions** - Apps, tools, examples, and projects built using Pollinations AI
3. **Documentation & Guides** - Tutorials, examples, API documentation
4. **Infrastructure & DevOps** - Deployment, monitoring, performance improvements

CONTEXTUAL ANALYSIS - Determine the PR type based on file paths and changes:

**CORE PLATFORM CHANGES** (affects all users):
- Files in: `/api/`, `/models/`, `/backend/`, `/frontend/`, `/docker/`, `/kubernetes/`, `/src/`
- Changes to: Rate limits, authentication, model endpoints, API responses
- Announcement focus: Technical impact, breaking changes, new capabilities

**COMMUNITY PROJECT SUBMISSIONS** (showcases community creativity):
- Files in: `/projects/`, `/examples/`, `/apps/`, `/tools/`, `/community/`, `/notebooks/`
- New directories with complete applications/tools
- Announcement focus: Celebrate contributor, describe the project, encourage exploration

**DOCUMENTATION UPDATES** (helps users learn):
- Files: `README.md`, `/docs/`, `/guides/`, `/tutorials/`, `.md` files
- Announcement focus: What's easier to understand now, new learning resources

**INFRASTRUCTURE CHANGES** (behind-the-scenes improvements):
- Files: `/deploy/`, `/monitoring/`, `/scripts/`, `docker-compose.yml`, CI/CD files, `.github/`
- Announcement focus: Performance improvements, reliability, developer experience

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
1. **Identify the PR type first** based on file paths and content
2. **Tailor the announcement** to the appropriate audience and impact level
3. **For community projects:** Celebrate the contributor and describe what they built
4. **For platform changes:** Focus on technical impact and user benefits
5. **Use appropriate tone** - friendly, informative, like talking to the community

CHANGE TYPES TO FOCUS ON:
- **New Features**: New endpoints, capabilities, models, tools
- **Community Projects**: Apps, examples, tools built by community members
- **Feature Removals**: Deprecated/removed functionality users were using
- **Configuration Changes**: Rate limits, timeouts, model access, pricing
- **API Changes**: New parameters, changed responses, breaking changes
- **Bug Fixes**: Issues that were affecting user experience
- **Performance**: Speed improvements, optimizations users will notice
- **Security**: Authentication, access control, vulnerability fixes
- **Documentation**: Important updates to guides, examples, API docs

IGNORE:
- Internal refactoring that doesn't affect users
- Code style/formatting changes
- Test-only updates (unless they reveal new features)
- Minor documentation typos

OUTPUT FORMAT:
Create a Discord message (NOT an embed) that follows this structure:

```
## 🐝 [Title with appropriate emoji]

Hey <@&1424461167883194418>! [Opening line about what's new]

### 🔐 [Section Title with emoji]
[Detailed explanation of what changed, including:]
- Specific details about the change
- **Before/after values** for config changes
- Impact on users and their applications
- Any action needed from users

### ⚡ [Another Section if needed]
[More changes grouped logically]

[Closing line - thanks, context, or next steps]
```

CRITICAL REQUIREMENT:
- ALWAYS start your announcement with "Hey <@&1424461167883194418>!" to mention the update role
- This ensures all users with the update role get notified about changes
- You can vary the greeting style but MUST include <@&1424461167883194418>

EXAMPLE OUTPUT (for reference):
```
## 🐝 General Update

Hey <@&1424461167883194418>! Here's what's new:

### � Wildtcard Domain Support
If you're building apps with Pollinations, you can now use wildcard patterns like `*.example.com` to cover all your subdomains at once! No more adding each subdomain separately. Plus, we've added extra security to prevent any sneaky domain spoofing attempts.

### ⚡ Temporary Queue Adjustments
We've had to tighten limits on our premium models (Nanobanana & Seedream) for now:
- **Longer wait times between requests** (2 minutes instead of 30 seconds)
- **Reduced concurrent requests** to manage our API credits

These restrictions are **temporary until the Pollen update drops** 🍯. Thanks for your patience while we work on a more sustainable solution! 🙏

### 🎃 Hacktoberfest is Here!
Pollinations is participating in **Hacktoberfest 2025**! Whether you're a developer or want to learn - contributions are welcome. Come build with us! 🙌
```

IMPORTANT RULES:
- ALWAYS mention the update role <@&1424461167883194418> in your opening greeting
- Start with ## and an emoji-based title
- Use ### for section headers with appropriate emojis
- Use **bold** for emphasis on important values/changes
- Use `code` for technical terms, file names, endpoints
- Use - for bullet points
- Show before → after or old vs new values
- Keep friendly, conversational tone
- Be specific about what changed - no generic responses
- Max 2000 characters total (Discord limit)

The output should be the raw Discord message text, not YAML or JSON.
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
Analyze these code changes and create a comprehensive Discord announcement for the Pollinations AI community.

FIRST: Determine the PR type based on file paths:
- **Core Platform** (API/backend/models): Focus on technical impact, breaking changes
- **Community Project** (projects/examples/apps): Celebrate contributor, describe the project
- **Documentation** (README/docs/guides): Highlight learning improvements
- **Infrastructure** (deploy/monitoring/CI): Focus on performance/reliability improvements

THEN: Focus on:
1. **What functionality changed** - be specific about features, endpoints, configurations
2. **User impact** - how does this affect developers using the platform?
3. **Before/after values** - for rate limits, timeouts, model access, etc.
4. **Breaking changes** - anything that might break existing user code
5. **New capabilities** - what can users now do that they couldn't before?
6. **Community contributions** - if it's a project submission, celebrate the contributor

Consider the PR title and description for context, but focus primarily on what the code changes reveal.

Create a Discord message (raw text, not YAML/JSON) following the format specified in the system prompt.
Choose the appropriate announcement style based on the PR type you identified.
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
    
    # Ensure message isn't too long for Discord (2000 char limit)
    if len(message) > 1900:
        message = message[:1897] + "..."
    
    print(f"DEBUG: Cleaned message length: {len(message)}")
    print(f"DEBUG: Final message:\n{message}")
    
    return message

def format_review_for_discord(message_content: str, pr_info: Dict) -> Dict:
    """Format announcement message for Discord webhook"""
    
    # Format timestamp for Discord-like display
    from datetime import datetime
    try:
        if pr_info.get('merged_at'):
            # Parse ISO timestamp and format for display
            dt = datetime.fromisoformat(pr_info['merged_at'].replace('Z', '+00:00'))
            time_str = dt.strftime("%I:%M %p")
        else:
            time_str = "unknown time"
    except:
        time_str = "unknown time"
    
    # Add PR info footer to the message
    footer = f"\n\nPR #{pr_info['number']} • Merged by {pr_info['author']} • Today at {time_str}"
    
    # Combine message with footer, ensuring we don't exceed Discord limits
    full_message = message_content + footer
    if len(full_message) > 1900:
        # Truncate the main message to fit the footer
        available_space = 1900 - len(footer) - 3  # -3 for "..."
        message_content = message_content[:available_space] + "..."
        full_message = message_content + footer
    
    return {
        "content": full_message
    }

def post_to_discord(webhook_url: str, payload: Dict):
    """Post message to Discord webhook"""
    response = requests.post(webhook_url, json=payload)
    
    if response.status_code not in [200, 204]:
        print(f"❌ Discord webhook error: {response.status_code}")
        print(response.text)
        sys.exit(1)
    
    print("✅ Successfully posted to Discord!")

def main():
    print("🚀 Starting Update Announcement Generator...")
    
    # Get environment variables
    github_token = get_env('GITHUB_TOKEN')
    pollinations_token = get_env('POLLINATIONS_TOKEN') or get_env('POLLINATIONS_TOKEN_DCPRS', required=False)
    if not pollinations_token:
        print("❌ Error: POLLINATIONS_TOKEN or POLLINATIONS_TOKEN_DCPRS environment variable is required")
        sys.exit(1)
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
        discord_payload = format_review_for_discord(message_content, pr_info)
    except Exception as e:
        print(f"❌ Error formatting for Discord: {e}")
        print(f"Message content: {message_content}")
        raise
    
    # Post to Discord
    print("📤 Posting to Discord...")
    post_to_discord(discord_webhook, discord_payload)
    
    print("✨ Done!")

if __name__ == "__main__":
    main()
