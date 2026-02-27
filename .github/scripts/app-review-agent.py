#!/usr/bin/env python3
"""
App Review Agent - Uses Pollinations API directly instead of Claude Code Action.
Lightweight, fast, total control.

Usage:
    ISSUE_NUMBER=123 GH_TOKEN=xxx POLLINATIONS_API_KEY=xxx python app-review-agent.py
"""

import os
import json
import subprocess
import requests
import re
import shlex
import sys
from datetime import datetime

# Config
ISSUE_NUMBER = os.environ.get("ISSUE_NUMBER")
GH_TOKEN = os.environ.get("GH_TOKEN")
POLLINATIONS_API_KEY = os.environ.get("POLLINATIONS_API_KEY", "")
VALIDATION_RESULT = os.environ.get("VALIDATION_RESULT", "{}")
ISSUE_AUTHOR = os.environ.get("ISSUE_AUTHOR", "")
BOT_NAME = os.environ.get("BOT_NAME", "pollinations-ai[bot]")
BOT_EMAIL = os.environ.get("BOT_EMAIL", "pollinations-ai[bot]@users.noreply.github.com")

POLLINATIONS_API = "https://gen.pollinations.ai/v1/chat/completions"
MODEL = "openai"

# Load skill as system prompt
SKILL_PATH = ".claude/skills/app-review/SKILL.md"
DESCRIPTION_PROMPT_PATH = ".github/scripts/app-description-prompt.txt"

def load_skill():
    """Load the skill file as system prompt."""
    with open(SKILL_PATH, "r") as f:
        return f.read()

def load_description_prompt():
    """Load the shared description rewriting prompt."""
    with open(DESCRIPTION_PROMPT_PATH, "r") as f:
        return f.read().strip()

def sanitize_string(s, max_length=100):
    if not s or not isinstance(s, str):
        return ""
    safe_chars = re.sub(r'[^a-zA-Z0-9\s\-_\.]', '', s)
    return safe_chars[:max_length].strip()

def run_cmd(cmd_list, check=True):
    if isinstance(cmd_list, str):
        print(f"  WARNING: Using string command (unsafe): {cmd_list[:50]}...")
        cmd_list = shlex.split(cmd_list)
    
    print(f"  $ {' '.join(shlex.quote(arg) for arg in cmd_list)}")
    env = dict(os.environ)
    env["GH_TOKEN"] = GH_TOKEN or ""
    result = subprocess.run(
        cmd_list, capture_output=True, text=True, env=env  # Removed shell=True
    )
    if check and result.returncode != 0:
        print(f"  Error: {result.stderr}")
    return result.stdout.strip(), result.returncode

def gh_api(endpoint, method="GET", data=None):
    """Call GitHub API."""
    headers = {
        "Authorization": f"Bearer {GH_TOKEN}",
        "Accept": "application/vnd.github+json"
    }
    url = f"https://api.github.com{endpoint}"

    if method == "GET":
        resp = requests.get(url, headers=headers)
    elif method == "POST":
        resp = requests.post(url, headers=headers, json=data)
    elif method == "PATCH":
        resp = requests.patch(url, headers=headers, json=data)
    else:
        resp = requests.get(url, headers=headers)

    return resp.json() if resp.text else {}

def get_github_user_id(username):
    """Fetch GitHub user ID for a username."""
    if not username:
        return ""
    # Remove @ prefix if present
    username = username.lstrip('@')
    try:
        user_data = gh_api(f"/users/{username}")
        return str(user_data.get("id", ""))
    except Exception as e:
        print(f"  Warning: Could not fetch GitHub user ID for {username}: {e}")
        return ""

def call_llm(system_prompt, user_message):
    """Call Pollinations API for a single completion."""
    headers = {"Content-Type": "application/json"}
    if POLLINATIONS_API_KEY:
        headers["Authorization"] = f"Bearer {POLLINATIONS_API_KEY}"

    response = requests.post(
        POLLINATIONS_API,
        json={
            "model": MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            "max_tokens": 2048
        },
        headers=headers
    )

    if not response.ok:
        raise Exception(f"API error: {response.status_code} {response.text}")

    return response.json()["choices"][0]["message"]["content"]

def infer_platform(name, url, description):
    """Deterministically infer platform from name, URL, and description."""
    from urllib.parse import urlparse
    d = (description or "").lower()
    n = (name or "").lower()
    nd = f"{n} {d}"

    # Parse URL for safe hostname/path checks
    hostname = ""
    url_path_lower = ""
    if url:
        try:
            raw = url if url.startswith(("http://", "https://")) else f"https://{url}"
            parsed = urlparse(raw.lower())
            hostname = parsed.hostname or ""
            url_path_lower = (parsed.path or "").lower()
        except Exception:
            pass

    def host_is(domain):
        return hostname == domain or hostname.endswith(f".{domain}")

    # URL-based rules (safe hostname matching)
    if host_is("play.google.com"): return "android"
    if host_is("apps.apple.com"): return "ios"
    if host_is("routinehub.co"): return "ios"
    if host_is("api.whatsapp.com") or host_is("chat.whatsapp.com"): return "whatsapp"
    if host_is("t.me"): return "telegram"
    if host_is("discord.gg") or host_is("discord.com"): return "discord"
    if host_is("addons.mozilla.org"): return "browser-ext"
    if host_is("chromewebstore.google.com") or (host_is("chrome.google.com") and url_path_lower.startswith("/webstore")): return "browser-ext"
    if host_is("roblox.com"): return "roblox"
    if host_is("pypi.org"): return "library"
    if host_is("npmjs.com"): return "library"
    if host_is("wordpress.org") and url_path_lower.startswith("/plugins"): return "wordpress"
    if host_is("bsky.app"): return "api"
    if host_is("pkg.go.dev") or host_is("crates.io"): return "library"
    if url_path_lower.endswith(".exe"): return "windows"

    # Description/name-based rules
    if "discord bot" in nd or "discord slash" in nd: return "discord"
    if "telegram bot" in nd or ("telegram" in nd and "bot" in nd): return "telegram"
    if "whatsapp" in nd: return "whatsapp"
    if "roblox" in nd: return "roblox"
    if "wordpress plugin" in nd or "wordpress" in nd: return "wordpress"
    if "home assistant" in nd: return "api"
    if "obsidian plugin" in nd: return "library"
    if "firefox extension" in nd or "chrome extension" in nd or "browser extension" in nd: return "browser-ext"
    if "command-line" in nd or "command line" in nd or " cli " in nd: return "cli"
    if "pyqt" in nd or "tkinter" in nd or "desktop app" in nd or "desktop application" in nd: return "desktop"
    if "rimworld" in nd or "steam workshop" in nd or "game mod" in nd: return "desktop"
    if "discord" in nd and not hostname: return "discord"
    if "telegram" in nd and not hostname: return "telegram"

    # Default
    if hostname: return "web"
    return "api"


def parse_issue(body):
    """Parse issue body to extract app details."""
    def extract(pattern, default=""):
        match = re.search(pattern, body, re.IGNORECASE | re.MULTILINE)
        return match.group(1).strip() if match else default

    return {
        "name": sanitize_string(extract(r"### App Name\s*\n(.+?)(?:\n|$)"), 50),
        "description": sanitize_string(extract(r"### App Description\s*\n(.+?)(?:\n###|$)", ""), 200),
        "url": extract(r"### App URL\s*\n(.+?)(?:\n|$)"),
        "repo": extract(r"### GitHub.*Repository.*URL\s*\n(.+?)(?:\n|$)"),
        "discord": extract(r"### Discord.*\s*\n(.+?)(?:\n|$)"),
        "category": sanitize_string(extract(r"### App Category\s*\n(.+?)(?:\n|$)"), 20),
        "language": extract(r"### App Language\s*\n(.+?)(?:\n|$)", "en"),
        "email": extract(r"### Email.*\s*\n(.+?)(?:\n|$)")
    }

def main():
    if not GH_TOKEN:
        print("❌ Error: GH_TOKEN environment variable is required")
        sys.exit(1)
    if not ISSUE_NUMBER:
        print("❌ Error: ISSUE_NUMBER environment variable is required")
        sys.exit(1)
    if not ISSUE_AUTHOR:
        print("❌ Error: ISSUE_AUTHOR environment variable is required")
        sys.exit(1)

    print(f"🚀 App Review Agent")
    print(f"   Issue: #{ISSUE_NUMBER}")
    print(f"   Author: {ISSUE_AUTHOR}")

    # Parse validation result
    try:
        validation = json.loads(VALIDATION_RESULT)
    except:
        validation = {"valid": True, "errors": []}

    print(f"   Validation: {'✅ Passed' if validation.get('valid') else '❌ Failed'}")

    # If validation failed, let AI handle the response
    if not validation.get("valid"):
        errors = validation.get("errors", [])
        error_msg = "\n".join(f"- {e}" for e in errors)

        # Determine label based on error code (structured) or fallback to string matching
        registration = validation.get("checks", {}).get("registration", {})
        error_code = registration.get("error_code")
        duplicate = validation.get("checks", {}).get("duplicate", {})

        if duplicate.get("isDuplicate"):
            label = "TIER-APP-REJECTED"
        elif error_code == "SPORE_TIER":
            label = "TIER-APP-REJECTED"
        elif error_code == "TIER_NOT_SET":
            # System bug - don't reject, mark incomplete so we can investigate
            label = "TIER-APP-INCOMPLETE"
        elif error_code == "NOT_REGISTERED":
            label = "TIER-APP-INCOMPLETE"
        else:
            label = "TIER-APP-INCOMPLETE"

        # Let AI generate the response
        system_prompt = load_skill()
        user_prompt = f"""Validation failed for app submission #{ISSUE_NUMBER}.

Errors:
{error_msg}

Write a concise, helpful comment (2-3 sentences max) explaining the issue and what the user should do. Be friendly but direct. If not registered, mention enter.pollinations.ai. Don't use markdown headers."""

        print("🤖 Asking LLM for error response...")
        try:
            comment = call_llm(system_prompt, user_prompt)
        except Exception as e:
            print(f"⚠️ LLM failed: {e}, using fallback")
            comment = "There was an issue processing your submission. Please check the requirements and try again, or comment here for help."

        # Post comment
        gh_api(f"/repos/pollinations/pollinations/issues/{ISSUE_NUMBER}/comments", "POST", {"body": comment})

        # Update label
        run_cmd(["gh", "issue", "edit", ISSUE_NUMBER, "--remove-label", "TIER-APP", "--add-label", label])

        if label == "TIER-APP-REJECTED":
            run_cmd(["gh", "issue", "close", ISSUE_NUMBER])

        print(f"   ❌ Handled validation failure: {label}")
        return

    # Validation passed - fetch and parse issue
    issue_data, _ = run_cmd(["gh", "issue", "view", ISSUE_NUMBER, "--json", "body,author,title"])
    issue = json.loads(issue_data)
    parsed = parse_issue(issue.get("body", ""))

    print(f"   App: {parsed['name']}")
    print(f"   URL: {parsed['url']}")

    # Use LLM to pick emoji and refine category/description
    system_prompt = load_skill()
    user_prompt = f"""Process this app submission:

Name: {parsed['name']}
URL: {parsed['url']}
Description: {parsed['description']}
Category (user provided): {parsed['category']}
Language: {parsed['language']}
Repo: {parsed['repo']}
Discord: {parsed['discord']}

Respond with ONLY a JSON object (no markdown, no explanation):
{{
    "emoji": "single emoji that represents this app",
    "category": "one of: image, video_audio, writing, chat, games, learn, bots, build, business",
    "language": "ISO code like en, zh-CN, es, ja",
    "platform": "one of: web, android, ios, windows, macos, desktop, cli, discord, telegram, whatsapp, library, browser-ext, roblox, wordpress, api"
}}"""

    print("🤖 Asking LLM for emoji/category...")
    llm_response = call_llm(system_prompt, user_prompt)

    # Parse LLM response
    try:
        json_match = re.search(r'\{[^{}]+\}', llm_response, re.DOTALL)
        if json_match:
            llm_data = json.loads(json_match.group())
        else:
            raise ValueError("No JSON found")
    except:
        print(f"   ⚠️ Could not parse LLM response, using defaults")
        llm_data = {
            "emoji": "🚀",
            "category": parsed['category'] or "build",
            "language": "en"
        }

    emoji = llm_data.get("emoji", "🚀")
    category = llm_data.get("category", "build")
    language = llm_data.get("language", "en")
    platform = llm_data.get("platform") or infer_platform(parsed['name'], parsed['url'], parsed['description'])

    print(f"   Emoji: {emoji}")
    print(f"   Category: {category}")

    # AI-rewrite the description using the shared prompt
    raw_description = parsed['description'] or parsed['name']
    print("🤖 Rewriting description with shared prompt...")
    try:
        desc_prompt = load_description_prompt()
        description = call_llm(desc_prompt, f'App: "{parsed["name"]}" — Original: "{raw_description}"')
        description = description.strip().strip('"')
        # Validate
        if not description or len(description) > 200 or len(description) < 10 or "|" in description or "\n" in description:
            print(f"   ⚠️ AI description invalid (len={len(description)}), falling back to sanitized")
            description = sanitize_string(raw_description, 200)
    except Exception as e:
        print(f"   ⚠️ Description rewrite failed: {e}, using sanitized")
        description = sanitize_string(raw_description, 200)

    print(f"   Description: {description}")

    # Get stars from validation result
    stars = validation.get("stars", 0)
    stars_str = f"⭐{stars}" if stars else ""

    # Create branch
    slug = parsed['name'].lower().replace(" ", "-").replace("_", "-")[:20]
    branch = f"auto/app-{ISSUE_NUMBER}-{slug}"

    run_cmd(["git", "fetch", "origin", "main"])
    run_cmd(["git", "checkout", "-b", branch, "origin/main"])

    # Build the row
    today = datetime.now().strftime("%Y-%m-%d")
    repo_url = parsed['repo'] if parsed['repo'] and parsed['repo'] != "_No response_" else ""
    discord = parsed['discord'] if parsed['discord'] and parsed['discord'] != "_No response_" else ""

    # Fetch GitHub user ID
    github_user_id = get_github_user_id(ISSUE_AUTHOR)
    print(f"   GitHub User ID: {github_user_id}")

    # Determine if app URL is a GitHub repo or a web URL
    app_url = parsed['url'] if parsed['url'] and parsed['url'] != "_No response_" else ""
    is_github_repo = "github.com" in app_url and "github.io" not in app_url
    
    if is_github_repo:
        web_url = ""
        # Use app URL as repo if no separate repo provided
        if not repo_url:
            repo_url = app_url
    else:
        web_url = app_url

    # Get issue creation date for Submitted_Date
    issue_created_at = ""
    try:
        issue_details = gh_api(f"/repos/pollinations/pollinations/issues/{ISSUE_NUMBER}")
        created_at = issue_details.get("created_at", "")
        if created_at:
            issue_created_at = created_at[:10]  # YYYY-MM-DD
    except Exception as e:
        print(f"   Warning: Could not fetch issue creation date: {e}")
        issue_created_at = today  # Fallback to today

    issue_url = f"https://github.com/pollinations/pollinations/issues/{ISSUE_NUMBER}"

    # Format: | Emoji | Name | Web_URL | Description | Language | Category | Platform | GitHub_Username | GitHub_UserID | Github_Repository_URL | Github_Repository_Stars | Discord_Username | Other | Submitted_Date | Issue_URL | Approved_Date | BYOP | Requests_24h | Health |
    new_row = f"| {emoji} | {parsed['name']} | {web_url} | {description} | {language} | {category} | {platform} | @{ISSUE_AUTHOR} | {github_user_id} | {repo_url} | {stars_str} | {discord} | | {issue_created_at} | {issue_url} | {today} |  |  |  |"

    # Add row using the prepend script
    os.environ["NEW_ROW"] = new_row
    run_cmd(["node", ".github/scripts/app-prepend-row.js"])
    run_cmd(["node", ".github/scripts/app-update-greenhouse.js"])

    # Configure git
    run_cmd(["git", "config", "user.name", BOT_NAME])
    run_cmd(["git", "config", "user.email", BOT_EMAIL])

    # Commit with issue author as co-author
    commit_msg = f"""Add {parsed['name']} to {category}

Co-authored-by: {ISSUE_AUTHOR} <{ISSUE_AUTHOR}@users.noreply.github.com>"""

    run_cmd(["git", "add", "-A"])
    run_cmd(["git", "commit", "-m", commit_msg])
    run_cmd(["git", "push", "origin", branch, "--force-with-lease"])

    # Check for existing PR
    existing_pr = validation.get("existing_pr")
    if existing_pr:
        print(f"   📝 Updating existing PR #{existing_pr['number']}")
    else:
        # Create PR
        pr_body = f"- Adds [{parsed['name']}]({parsed['url']}) to {category}\n- {description}\n\nFixes #{ISSUE_NUMBER}"
        run_cmd(["gh", "pr", "create", "--title", f"Add {parsed['name']} to {category}", "--body", pr_body, "--label", "TIER-APP-REVIEW-PR"])

    # Update issue label (remove both TIER-APP and TIER-APP-INCOMPLETE if present)
    run_cmd(["gh", "issue", "edit", ISSUE_NUMBER, "--remove-label", "TIER-APP", "--remove-label", "TIER-APP-INCOMPLETE", "--add-label", "TIER-APP-REVIEW"])

    print(f"   ✅ Done!")

if __name__ == "__main__":
    main()
