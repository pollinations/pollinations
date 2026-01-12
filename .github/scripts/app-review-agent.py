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

def load_skill():
    """Load the skill file as system prompt."""
    with open(SKILL_PATH, "r") as f:
        return f.read()

def run_cmd(cmd, check=True):
    """Run a shell command and return output."""
    print(f"  $ {cmd}")
    env = dict(os.environ)
    env["GH_TOKEN"] = GH_TOKEN or ""
    result = subprocess.run(
        cmd, shell=True, capture_output=True, text=True, env=env
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

def parse_issue(body):
    """Parse issue body to extract app details."""
    import re

    def extract(pattern, default=""):
        match = re.search(pattern, body, re.IGNORECASE | re.MULTILINE)
        return match.group(1).strip() if match else default

    return {
        "name": extract(r"### App Name\s*\n(.+?)(?:\n|$)"),
        "description": extract(r"### App Description\s*\n(.+?)(?:\n###|$)", ""),
        "url": extract(r"### App URL\s*\n(.+?)(?:\n|$)"),
        "repo": extract(r"### GitHub.*Repository.*URL\s*\n(.+?)(?:\n|$)"),
        "discord": extract(r"### Discord.*\s*\n(.+?)(?:\n|$)"),
        "category": extract(r"### App Category\s*\n(.+?)(?:\n|$)"),
        "language": extract(r"### App Language\s*\n(.+?)(?:\n|$)", "en"),
        "email": extract(r"### Email.*\s*\n(.+?)(?:\n|$)")
    }

def main():
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

        # Determine label based on error type
        if any("duplicate" in e.lower() for e in errors):
            label = "TIER-APP-REJECTED"
        else:
            label = "TIER-APP-INCOMPLETE"

        # Let AI generate the response
        system_prompt = load_skill()
        user_prompt = f"""Validation failed for app submission #{ISSUE_NUMBER}.

Errors:
{error_msg}

Write a concise, helpful comment (2-3 sentences max) explaining the issue and what the user should do. Be friendly but direct. If not registered, mention enter.pollinations.ai. Don't use markdown headers."""

        print("   🤖 Asking LLM for error response...")
        try:
            comment = call_llm(system_prompt, user_prompt)
        except Exception as e:
            print(f"   ⚠️ LLM failed: {e}, using fallback")
            comment = "There was an issue processing your submission. Please check the requirements and try again, or comment here for help."

        # Post comment
        gh_api(f"/repos/pollinations/pollinations/issues/{ISSUE_NUMBER}/comments", "POST", {"body": comment})

        # Update label
        run_cmd(f'gh issue edit {ISSUE_NUMBER} --remove-label "TIER-APP" --add-label "{label}"')

        if label == "TIER-APP-REJECTED":
            run_cmd(f'gh issue close {ISSUE_NUMBER}')

        print(f"   ❌ Handled validation failure: {label}")
        return

    # Validation passed - fetch and parse issue
    issue_data, _ = run_cmd(f'gh issue view {ISSUE_NUMBER} --json body,author,title')
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
    "category": "one of: Creative, Chat, Games, Dev_Tools, Vibes, Social_Bots, Learn",
    "description": "concise 80 char max description",
    "language": "ISO code like en, zh-CN, es, ja"
}}"""

    print("   🤖 Asking LLM for emoji/category...")
    llm_response = call_llm(system_prompt, user_prompt)

    # Parse LLM response
    try:
        # Try to extract JSON from response
        import re
        json_match = re.search(r'\{[^{}]+\}', llm_response, re.DOTALL)
        if json_match:
            llm_data = json.loads(json_match.group())
        else:
            raise ValueError("No JSON found")
    except:
        print(f"   ⚠️ Could not parse LLM response, using defaults")
        llm_data = {
            "emoji": "🚀",
            "category": parsed['category'] or "Dev_Tools",
            "description": parsed['description'][:80] if parsed['description'] else parsed['name'],
            "language": "en"
        }

    emoji = llm_data.get("emoji", "🚀")
    category = llm_data.get("category", "Dev_Tools")
    description = llm_data.get("description", parsed['name'])[:80]
    language = llm_data.get("language", "en")

    print(f"   Emoji: {emoji}")
    print(f"   Category: {category}")

    # Get stars from validation result
    stars = validation.get("stars", 0)
    stars_str = f"⭐{stars}" if stars else ""

    # Create branch
    slug = parsed['name'].lower().replace(" ", "-").replace("_", "-")[:20]
    branch = f"auto/app-{ISSUE_NUMBER}-{slug}"

    run_cmd("git fetch origin main")
    run_cmd(f"git checkout -b {branch} origin/main")

    # Build the row
    today = datetime.now().strftime("%Y-%m-%d")
    repo_url = parsed['repo'] if parsed['repo'] and parsed['repo'] != "_No response_" else ""
    discord = parsed['discord'] if parsed['discord'] and parsed['discord'] != "_No response_" else ""

    new_row = f"| {emoji} | [{parsed['name']}]({parsed['url']}) | {description} | {language} | {category} | @{ISSUE_AUTHOR} | {repo_url} | {stars_str} | {discord} | | {today} |"

    # Add row using the prepend script
    os.environ["NEW_ROW"] = new_row
    run_cmd("node .github/scripts/app-prepend-row.js")
    run_cmd("node .github/scripts/app-update-readme.js")

    # Configure git
    run_cmd(f'git config user.name "{BOT_NAME}"')
    run_cmd(f'git config user.email "{BOT_EMAIL}"')

    # Commit with issue author as co-author
    commit_msg = f"""Add {parsed['name']} to {category}

Co-authored-by: {ISSUE_AUTHOR} <{ISSUE_AUTHOR}@users.noreply.github.com>"""

    run_cmd("git add -A")
    run_cmd(f'git commit -m "{commit_msg}"')
    run_cmd(f"git push origin {branch} --force-with-lease")

    # Check for existing PR
    existing_pr = validation.get("existing_pr")
    if existing_pr:
        print(f"   📝 Updating existing PR #{existing_pr['number']}")
    else:
        # Create PR
        pr_body = f"- Adds [{parsed['name']}]({parsed['url']}) to {category}\n- {description}\n\nFixes #{ISSUE_NUMBER}"
        run_cmd(f'gh pr create --title "Add {parsed["name"]} to {category}" --body "{pr_body}" --label "TIER-APP-REVIEW-PR"')

    # Update issue label
    run_cmd(f'gh issue edit {ISSUE_NUMBER} --remove-label "TIER-APP" --add-label "TIER-APP-REVIEW"')

    print(f"   ✅ Done!")

if __name__ == "__main__":
    main()
