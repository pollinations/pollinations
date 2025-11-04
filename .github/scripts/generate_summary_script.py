#!/usr/bin/env python3
"""
Generate Individual PR Summary
Creates a JSON summary of a merged PR for later aggregation into weekly digest
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
POLLINATIONS_API_BASE = "https://enter.pollinations.ai/api/generate/openai"
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
    return """You are creating a structured summary of a merged PR for Pollinations AI weekly digest compilation.
Your task is to analyze merged pull requests and create user-facing summaries about what changed.

CRITICAL RULE: IGNORE PR titles and descriptions! They are often misleading or generic. 
ONLY analyze the actual code changes in the diff to determine what really changed.

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
- Focus: What changed for users, bug fixes they'll notice, new features they can use

**COMMUNITY PROJECT SUBMISSIONS** (showcases community creativity):
- Files in: `/projects/`, `/examples/`, `/apps/`, `/tools/`, `/community/`, `/notebooks/`
- New directories with complete applications/tools
- Focus: Celebrate contributor, describe the project, encourage exploration

**DOCUMENTATION UPDATES** (helps users learn):
- Files: `README.md`, `/docs/`, `/guides/`, `/tutorials/`, `.md` files
- Focus: What's easier to understand now, new learning resources

**INFRASTRUCTURE CHANGES** (behind-the-scenes improvements):
- Files: `/deploy/`, `/monitoring/`, `/scripts/`, `docker-compose.yml`, CI/CD files, `.github/`
- Focus: Performance improvements users will notice, reliability improvements

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
Return ONLY a JSON object with this structure:
{
  "category": "core|community|docs|infrastructure",
  "summary": "Brief description of the main change (no emojis or formatting)",
  "impact": "high|medium|low",
  "details": ["Detail 1 (no emojis)", "Detail 2 (no emojis)", "Detail 3 (no emojis)"]
}

GUIDELINES:
- category: Choose based on file paths and change type above
- summary: One concise sentence describing what changed for users (no emojis, no markdown)
- impact: high (new features/major fixes), medium (minor features/docs), low (internal changes)
- details: 2-4 key points, direct and factual (no emojis, no markdown formatting)
- Keep summaries clean and technical for later compilation into final digest
- Focus on WHAT changed for users, not HOW it was implemented
- Use present tense: "Adds X", "Fixes Y", "Improves Z"
- Prioritize completeness over brevity for significant changes, but stay concise for routine updates

The output should be clean JSON without any Discord formatting, emojis, or markdown."""

def get_user_prompt(title: str, branch: str, description: str, diff: str) -> str:
    """Return the PR analysis prompt"""
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
Analyze these code changes and create a structured summary for the Pollinations AI weekly digest.

CRITICAL: IGNORE the PR title and description - ONLY analyze the actual code changes shown in the diff!
The PR title/description may be misleading or generic. Focus ONLY on what the code actually does.

REMEMBER: You're talking to USERS of the service, NOT developers!

FIRST: Determine the PR type based on file paths in the diff:
- **Core Platform** (API/backend/models): Focus on user-visible changes, bug fixes, new features
- **Community Project** (projects/examples/apps): Celebrate contributor, describe the project
- **Documentation** (README/docs/guides): Highlight what's easier to understand now
- **Infrastructure** (deploy/monitoring/CI): Only mention if users will notice performance/reliability improvements

THEN: Focus on USER IMPACT by analyzing the actual code changes:
1. **What changed for users** - based on the code diff, not the PR title
2. **Bug fixes they noticed** - look for actual fixes in the code
3. **New features they can use** - analyze new functions/endpoints/UI elements in the code
4. **Performance improvements they'll feel** - look for optimization changes
5. **Rate limit/quota changes** - check for actual rate limit modifications
6. **UI/UX improvements** - analyze frontend/UI code changes

SKIP:
- Backend refactoring (unless it fixes a user-facing bug)
- Database migrations (unless they improve user experience)
- Internal API changes (unless they break existing integrations)
- Code cleanup/organization
- Developer tooling

IMPORTANT: Base your analysis ENTIRELY on the code diff. If the code changes don't match the PR title, trust the code!

Create a structured JSON summary (no emojis, no markdown formatting) with:
- Appropriate category based on actual file paths in the diff
- Concise summary of what actually changed for users based on code analysis
- Impact level based on actual code significance
- Key details based on actual code changes, not PR description"""
    
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
    pollinations_token = get_env('POLLINATIONS_TOKEN')
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
    
    category = summary.get('category', 'unknown')
    impact = summary.get('impact', 'unknown')
    summary_text = summary.get('summary', 'No summary')
    
    print(f"✅ Summary saved: {category} ({impact} impact)")
    print(f"   {summary_text}")
    print(f"   PR URL: {pr_url}")
    print(f"   Author: {pr_author}")

if __name__ == "__main__":
    main()
