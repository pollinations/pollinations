#!/usr/bin/env python3
"""
Generate Individual PR Summary
Creates a JSON summary of a merged PR for later aggregation into daily digest
"""

import os
import sys
import json
import random
import requests
from typing import Dict, Optional
from jinja2 import Environment
from datetime import datetime

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

def format_diff_for_review(diff_text: str) -> str:
    """Format the diff text to match PR-Agent's format with line numbers"""
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
            if new_hunk_lines or old_hunk_lines:
                if new_hunk_lines:
                    formatted_output.append("__new hunk__")
                    formatted_output.extend(new_hunk_lines)
                if old_hunk_lines:
                    formatted_output.append("__old hunk__")
                    formatted_output.extend(old_hunk_lines)
                new_hunk_lines = []
                old_hunk_lines = []
            
            parts = line.split(' ')
            if len(parts) >= 4:
                filename_a = parts[2].replace('a/', '') if parts[2].startswith('a/') else parts[2]
                filename_b = parts[3].replace('b/', '') if parts[3].startswith('b/') else parts[3]
                
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
            if new_hunk_lines or old_hunk_lines:
                if new_hunk_lines:
                    formatted_output.append("__new hunk__")
                    formatted_output.extend(new_hunk_lines)
                if old_hunk_lines:
                    formatted_output.append("__old hunk__")
                    formatted_output.extend(old_hunk_lines)
                new_hunk_lines = []
                old_hunk_lines = []
            
            formatted_output.append("")
            formatted_output.append(line)
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
                if line.strip():
                    line_number += 1
                    new_hunk_lines.append(f"{line_number:2d}  {line}")
    
    if new_hunk_lines or old_hunk_lines:
        if new_hunk_lines:
            formatted_output.append("__new hunk__")
            formatted_output.extend(new_hunk_lines)
        if old_hunk_lines:
            formatted_output.append("__old hunk__")
            formatted_output.extend(old_hunk_lines)
    
    return '\n'.join(formatted_output)

def get_system_prompt() -> str:
    """Return the PR summary generation prompt"""
    return """You are analyzing a merged PR for Pollinations AI to create a concise summary.
This summary will be combined with other PR summaries into a daily digest.

Your task: Create a SHORT, bullet-point summary of what changed from a USER perspective.

CONTEXT: Pollinations is an open-source AI platform where:
- **Core Platform**: API, models, infrastructure
- **Community Projects**: Apps, tools, examples built with Pollinations
- **Documentation**: Guides, tutorials, API docs
- **Infrastructure**: Deployment, monitoring, performance

WHAT TO FOCUS ON (USER IMPACT):
- Bug fixes users noticed
- New features users can use
- Performance improvements
- UI/UX changes
- Rate limit/quota changes
- Community project submissions

WHAT TO SKIP:
- Backend refactoring (unless it fixes user bugs)
- Code cleanup/organization
- Test updates (unless revealing new features)
- Developer tooling

OUTPUT FORMAT:
Return ONLY a JSON object with this structure:
{
  "category": "core|community|docs|infrastructure",
  "summary": "One-line description of the change",
  "impact": "high|medium|low",
  "details": ["Bullet point 1", "Bullet point 2"]
}

- **category**: Type of change (core/community/docs/infrastructure)
- **summary**: One sentence describing the main change
- **impact**: 
  - high: New features, bug fixes, quota changes, major improvements
  - medium: Minor features, small improvements, documentation
  - low: Typo fixes, internal changes with minimal user impact
- **details**: 2-4 bullet points max, each under 100 chars

Keep it CONCISE. This will be combined with other PRs into one daily message.
"""

def get_user_prompt(title: str, branch: str, description: str, diff: str) -> str:
    """Return the PR analysis prompt"""
    template = """Analyze this merged PR:

Title: '{{ title }}'
Branch: '{{ branch }}'
{% if description and description != "No description provided" %}

Description:
{{ description }}
{% endif %}

Code Changes:
{{ diff }}

Create a concise JSON summary for the daily digest."""
    
    env = Environment()
    tmpl = env.from_string(template)
    return tmpl.render(
        title=title,
        branch=branch,
        description=description or "No description provided",
        diff=diff
    )

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
        "temperature": 0.2,
        "seed": seed
    }
    
    print(f"🤖 Generating PR summary with {MODEL}")
    
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

def parse_ai_response(response: str) -> Dict:
    """Parse AI response and extract JSON"""
    # Remove markdown code blocks if present
    content = response.strip()
    if content.startswith('```'):
        lines = content.split('\n')
        if lines[0].strip().startswith('```'):
            lines = lines[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        content = '\n'.join(lines)
    
    # Parse JSON
    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse AI response as JSON: {e}")
        print(f"Response: {content}")
        sys.exit(1)

def main():
    print("🚀 Generating PR summary...")
    
    # Get environment variables
    github_token = get_env('GITHUB_TOKEN')
    pollinations_token = os.getenv('POLLINATIONS_TOKEN_DCPRS') or get_env('POLLINATIONS_TOKEN')
    pr_number = get_env('PR_NUMBER')
    repo_full_name = get_env('REPO_FULL_NAME')
    pr_title = get_env('PR_TITLE')
    pr_url = get_env('PR_URL')
    pr_author = get_env('PR_AUTHOR')
    pr_branch = get_env('PR_BRANCH')
    
    print(f"📝 Analyzing PR #{pr_number}")
    
    # Get PR details
    pr_data = github_api_request(f"repos/{repo_full_name}/pulls/{pr_number}", github_token)
    pr_description = pr_data.get('body', '')
    merged_at = pr_data.get('merged_at', '')
    
    # Get and format diff
    print("📥 Fetching PR diff...")
    diff_raw = get_pr_diff(repo_full_name, pr_number, github_token)
    diff_formatted = format_diff_for_review(diff_raw)
    
    # Generate summary
    print("🤖 Generating summary...")
    system_prompt = get_system_prompt()
    user_prompt = get_user_prompt(pr_title, pr_branch, pr_description, diff_formatted)
    ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
    
    # Parse summary
    summary = parse_ai_response(ai_response)
    
    # Add metadata
    output = {
        "pr_number": int(pr_number),
        "pr_title": pr_title,
        "pr_url": pr_url,
        "pr_author": pr_author,
        "pr_branch": pr_branch,
        "merged_at": merged_at,
        "generated_at": datetime.utcnow().isoformat() + 'Z',
        **summary
    }
    
    # Save to file
    with open('pr_summary.json', 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"✅ Summary saved: {summary['category']} ({summary['impact']} impact)")
    print(f"   {summary['summary']}")
    print(f"   PR URL: {pr_url}")
    print(f"   Author: {pr_author}")

if __name__ == "__main__":
    main()
