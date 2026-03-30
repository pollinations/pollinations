#!/usr/bin/env python3
"""Generate "App of the Week" post for Discord. Runs Wednesdays 06:00 UTC."""

import json
import sys
import os
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (
    call_pollinations_api, generate_image, commit_files_to_branch,
    commit_image_to_branch, read_news_file, load_prompt, get_env,
    OWNER, REPO, GISTS_BRANCH as NEWS_BRANCH
)

TINYBIRD_BASE_URL = "https://api.europe-west2.gcp.tinybird.co/v0"
TRENDING_HISTORY_FILE = "social/news/trending/trending_app_history.json"


def query_tinybird_top_app(token: str) -> Optional[Dict]:
    """Query Tinybird for top app by request count."""
    import requests
    url = f"{TINYBIRD_BASE_URL}/pipes/app_top_weekly.json"
    try:
        response = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=30)
        if response.status_code != 200:
            print(f"  Tinybird API error: {response.status_code}")
            return None
        apps = response.json().get("data", [])
        if not apps:
            print("  No apps found")
            return None
        top_app = apps[0]
        print(f"  Top app: {top_app.get('hostname', 'unknown')} ({top_app.get('request_count', 0)} requests)")
        return top_app
    except Exception as e:
        print(f"  Error: {e}")
        return None


def load_trending_history(github_token: str) -> list:
    """Load trending app history from news branch."""
    history = read_news_file(TRENDING_HISTORY_FILE, github_token, OWNER, REPO)
    if isinstance(history, list):
        return history
    return history.get("apps", []) if isinstance(history, dict) else []


def is_duplicate(app: Dict, history: list) -> bool:
    """Check if app was featured in last 4 weeks."""
    hostname = app.get("hostname", "")
    username = app.get("username", "")
    for entry in history[-4:]:
        if entry.get("hostname") == hostname or entry.get("username") == username:
            print(f"  App featured recently — skipping")
            return True
    return False


def generate_content(app: Dict, token: str, verbose: bool) -> Optional[Dict]:
    """Generate Discord post content using Pollinations AI."""
    system_prompt = load_prompt("trending_app")
    user_prompt = f"""Top app this week:
Hostname: {app.get('hostname', 'unknown')}
Username: {app.get('username', 'unknown')}
Request Count: {app.get('request_count', 0)}
Generate a celebratory Discord post."""

    response = call_pollinations_api(system_prompt, user_prompt, token, temperature=0.8, verbose=verbose)
    if not response:
        return None
    try:
        return json.loads(response.strip())
    except json.JSONDecodeError as e:
        print(f"  JSON error: {e}")
        return None


def post_to_discord(webhook_url: str, message: str, image_bytes: bytes = None) -> bool:
    """Post message to Discord with optional image."""
    import requests
    if not webhook_url:
        return False
    if "?" not in webhook_url:
        webhook_url += "?wait=true"
    else:
        webhook_url += "&wait=true"
    try:
        if image_bytes:
            files = {
                "payload_json": (None, json.dumps({"content": message}), "application/json"),
                "files[0]": ("app-of-week.jpg", image_bytes, "image/jpeg"),
            }
            resp = requests.post(webhook_url, files=files, timeout=30)
        else:
            resp = requests.post(webhook_url, json={"content": message}, timeout=30)
        if resp.status_code in [200, 201, 204]:
            print("  Posted to Discord")
            return True
        print(f"  Discord error: {resp.status_code}")
        return False
    except Exception as e:
        print(f"  Error: {e}")
        return False


def commit_artifacts(date_str: str, app: Dict, content: Dict, image_bytes: bytes, github_token: str):
    """Commit post JSON and image to news branch."""
    base_path = f"social/news/trending/{date_str}"
    post_data = {
        "date": date_str,
        "app": app,
        "content": content,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    commit_files_to_branch([(f"{base_path}/post.json", post_data)], NEWS_BRANCH, github_token, OWNER, REPO, f"trending {date_str}")
    if image_bytes:
        commit_image_to_branch(image_bytes, f"{base_path}/image.jpg", NEWS_BRANCH, github_token, OWNER, REPO)


def update_history(history: list, app: Dict, github_token: str):
    """Save updated trending history."""
    entry = {
        "hostname": app.get("hostname", ""),
        "username": app.get("username", ""),
        "request_count": app.get("request_count", 0),
        "featured_at": datetime.now(timezone.utc).isoformat(),
    }
    history.append(entry)
    commit_files_to_branch([(TRENDING_HISTORY_FILE, history[-12:])], NEWS_BRANCH, github_token, OWNER, REPO, "history")


def main():
    """Main entry point."""
    print("=" * 60)
    print("App of the Week — Trending App Generator")
    print("=" * 60)
    
    pollinations_token = get_env("POLLINATIONS_API_KEY", required=True)
    tinybird_token = get_env("TINYBIRD_READ_TOKEN", required=True)
    github_token = get_env("GITHUB_TOKEN", required=True)
    discord_webhook = get_env("DISCORD_WEBHOOK_URL", required=False)
    verbose = os.getenv("VERBOSE", "").lower() in ("1", "true", "yes")
    
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Query Tinybird
    print("\n1. Querying Tinybird...")
    top_app = query_tinybird_top_app(tinybird_token)
    if not top_app:
        sys.exit(1)
    
    # Check history
    print("\n2. Checking history...")
    history = load_trending_history(github_token)
    if is_duplicate(top_app, history):
        sys.exit(0)
    
    # Generate content
    print("\n3. Generating content...")
    content = generate_content(top_app, pollinations_token, verbose)
    if not content:
        sys.exit(1)
    print(f"  Headline: {content.get('headline', '')}")
    
    # Generate image
    print("\n4. Generating image...")
    image_bytes, _ = generate_image(content.get("image_prompt", ""), pollinations_token)
    if image_bytes:
        print(f"  Image: {len(image_bytes):,} bytes")
    
    # Post to Discord
    if discord_webhook:
        print("\n5. Posting to Discord...")
        msg = f"**{content.get('headline', 'App of the Week')}**\n\n{content.get('message', '')}"
        post_to_discord(discord_webhook, msg, image_bytes)
    
    # Commit artifacts
    print("\n6. Committing artifacts...")
    commit_artifacts(date_str, top_app, content, image_bytes, github_token)
    
    # Update history
    print("\n7. Updating history...")
    update_history(history, top_app, github_token)
    
    print("\n" + "=" * 60)
    print("Done! 🎉")
    print("=" * 60)


if __name__ == "__main__":
    main()
