#!/usr/bin/env python3
"""
Update Announcement Generator for Discord
Analyzes merged PRs and creates user-facing announcements about changes
"""

import os
import sys
import json
import random
import re
import requests
from typing import Dict, List, Optional
from jinja2 import Environment, Template
from datetime import datetime
from common import (
    load_prompt,
    get_env,
    get_repo_root,
    call_pollinations_api,
    generate_image,
    GITHUB_API_BASE,
    MODEL,
    DISCORD_CHAR_LIMIT,
    DISCORD_CHUNK_SIZE as CHUNK_SIZE,
)

# Platform name for prompt loading
PLATFORM = "discord"


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
        # Truncate error output to avoid exposing sensitive info in CI logs
        error_preview = response.text[:500] + "..." if len(response.text) > 500 else response.text
        print(f"Error preview: {error_preview}")
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
    """Get list of files changed in PR with pagination"""
    all_files = []
    page = 1
    per_page = 100

    while True:
        endpoint = f"repos/{repo}/pulls/{pr_number}/files?per_page={per_page}&page={page}"
        files = github_api_request(endpoint, token)
        if not files:
            break
        all_files.extend(files)
        if len(files) < per_page:
            break
        page += 1

    return all_files

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

            # Parse filename using regex to handle spaces in paths
            # Format: diff --git a/path/to/file b/path/to/file
            # Use non-greedy (.*?) to correctly handle filenames containing ' b/'
            match = re.match(r'diff --git a/(.*?) b/(.*)', line)
            if match:
                filename_a = match.group(1)
                filename_b = match.group(2)

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
            except (ValueError, IndexError):
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
    """Load the system prompt from external file"""
    return load_prompt(PLATFORM, "merged_pr_system")

def get_user_prompt(title: str, branch: str, description: str) -> str:
    """Load user prompt template and render with PR data"""
    # Build description section
    description_section = ""
    if description and description != "No description provided":
        description_section = f"""
PR Description:
======
{description}
======"""

    # Load template and replace placeholders
    template = load_prompt(PLATFORM, "merged_pr_user")
    # Remove {diff} placeholder since we're not using it anymore
    return template.replace("{title}", title).replace("{branch}", branch).replace("{description_section}", description_section).replace("{diff}", "")

def parse_discord_message(response: str) -> str:
    """Parse Discord message from AI response"""
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



def format_review_for_discord(message_content: str, pr_info: Dict) -> str:
    """Format PR announcement message content"""
    time_str = format_timestamp(pr_info.get('merged_at'))
    pr_number = pr_info.get('number', 'Unknown')
    pr_url = pr_info.get('url', '#')
    pr_author = pr_info.get('author', 'Unknown')
    pr_creator = pr_info.get('created_by', pr_author)
    pr_link = f"[PR #{pr_number}](<{pr_url}>)"
    creator_link = f"[{pr_creator if pr_creator != 'Unknown' else 'Some Pollinations Contributor'}](<https://github.com/{pr_creator}>)"
    footer = f"\n\n{pr_link} • By {creator_link} • {time_str}"

    # Calculate available space for content (2000 char limit for Discord)
    max_length = 2000
    footer_length = len(footer)
    available_space = max_length - footer_length

    # Check if we need to truncate
    if len(message_content) > available_space:
        # Truncate message content to fit footer
        message_content = message_content[:available_space - 3] + "..."
        print(f"📦 Truncated message to fit Discord limit")

    return message_content + footer



def post_to_discord(webhook_url: str, message_content: str, image_bytes: Optional[bytes] = None):
    """Post message + optional image to Discord webhook as single message"""
    if image_bytes:
        # Send as multipart with both payload_json and file
        files = {
            "payload_json": (None, json.dumps({"content": message_content}), "application/json"),
            "files[0]": ("image.jpg", image_bytes, "image/jpeg")
        }
        response = requests.post(webhook_url, files=files)
    else:
        # Send as JSON
        response = requests.post(webhook_url, json={"content": message_content})

    if response.status_code not in [200, 204]:
        print(f"❌ Discord webhook error: {response.status_code}")
        error_preview = response.text[:500] + "..." if len(response.text) > 500 else response.text
        print(f"Error preview: {error_preview}")
        sys.exit(1)

    print("✅ Successfully posted to Discord!")

def main():
    print("🚀 Starting Update Announcement Generator...")
    
    # Get environment variables
    github_token = get_env('GITHUB_TOKEN')
    
    # Get Pollinations token from environment
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    print("🔑 Using POLLINATIONS_TOKEN")
    
    discord_webhook = get_env('DISCORD_WEBHOOK_URL')
    pr_number = get_env('PR_NUMBER')
    repo_full_name = get_env('REPO_FULL_NAME')

    # For manual dispatch, we need to fetch PR details from API
    # Check if we have the PR data from webhook (automatic trigger)
    pr_title = os.getenv('PR_TITLE')
    pr_url = os.getenv('PR_URL')
    pr_author = os.getenv('PR_AUTHOR')
    pr_branch = os.getenv('PR_BRANCH')

    # If missing, fetch from API (manual dispatch)
    if not pr_title or not pr_url:
        print("📥 Fetching PR details from GitHub API (manual dispatch mode)...")
        pr_data = github_api_request(f"repos/{repo_full_name}/pulls/{pr_number}", github_token)
        pr_title = pr_data.get('title', 'Unknown')
        pr_url = pr_data.get('html_url', '#')
        pr_author = pr_data.get('user', {}).get('login', 'Unknown')
        pr_branch = pr_data.get('head', {}).get('ref', 'unknown')
        pr_description = pr_data.get('body', '')
        merged_at = pr_data.get('merged_at', '')
    else:
        # Automatic trigger - fetch additional details
        print(f"📝 Reviewing PR #{pr_number} in {repo_full_name}")
        print(f"🔗 {pr_url}")
        pr_data = github_api_request(f"repos/{repo_full_name}/pulls/{pr_number}", github_token)
        pr_description = pr_data.get('body', '')
        merged_at = pr_data.get('merged_at', '')

    # Prepare prompts (no diff fetching)
    print("📋 Preparing review prompts...")
    system_prompt = get_system_prompt()
    user_prompt = get_user_prompt(pr_title, pr_branch, pr_description)
    
    # Get AI announcement
    print("🤖 Generating update announcement...")
    print(f"🤖 Calling Pollinations AI API with model: {MODEL}")
    ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token, temperature=0.2, exit_on_failure=True)
    
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
        message_content = format_review_for_discord(message_content, pr_info)
    except Exception as e:
        print(f"❌ Error formatting for Discord: {e}")
        print(f"Message content: {message_content}")
        raise

    # Generate image
    print("🎨 Generating image...")
    image_prompt_system = load_prompt(PLATFORM, "image_prompt_system")
    image_prompt = call_pollinations_api(image_prompt_system, message_content, pollinations_token, temperature=0.7)
    image_bytes = None
    if image_prompt:
        image_prompt = image_prompt.strip()
        print(f"Image prompt: {image_prompt[:100]}...")
        image_bytes, _ = generate_image(image_prompt, pollinations_token)

    # Post to Discord (text + image in one message)
    print("📤 Posting to Discord...")
    post_to_discord(discord_webhook, message_content, image_bytes)

    print("✨ Done!")

if __name__ == "__main__":
    main()
