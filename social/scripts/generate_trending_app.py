#!/usr/bin/env python3
"""Generate 'App of the Week' post for Discord. Runs Wednesdays 06:00 UTC."""

import json
import sys
import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (
    call_pollinations_api, generate_image, commit_files_to_branch,
    commit_image_to_branch, read_news_file, load_prompt, get_env,
    OWNER, REPO, GISTS_BRANCH as NEWS_BRANCH
)
from publish_weekly import post_to_discord

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
        display = top_app.get('display_name', top_app.get('hostname', 'unknown'))
        print(f"  Top app: {display} ({top_app.get('request_count', 0):,} requests)")
        return top_app
    except Exception as e:
        print(f"  Error: {e}")
        return None


def load_apps_metadata(repo_root: str) -> Dict[str, Dict]:
    """Load app metadata from APPS.md, keyed by GitHub username."""
    apps_path = os.path.join(repo_root, "apps", "APPS.md")
    if not os.path.exists(apps_path):
        print(f"  Warning: APPS.md not found at {apps_path}")
        return {}
    
    apps = {}
    try:
        with open(apps_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        lines = content.split("\n")
        in_table = False
        headers = []
        
        for line in lines:
            line = line.strip()
            if line.startswith("|") and "Emoji" in line:
                headers = [h.strip() for h in line.split("|") if h.strip()]
                in_table = True
                continue
            if in_table and line.startswith("|") and "---" not in line:
                cells = [c.strip() for c in line.split("|") if c.strip()]
                if len(cells) >= len(headers):
                    row = dict(zip(headers, cells))
                    username = row.get("GitHub_Username", "").lstrip("@")
                    if username:
                        apps[username] = {
                            "name": row.get("Name", ""),
                            "url": row.get("Web_URL", ""),
                            "description": row.get("Description", ""),
                            "category": row.get("Category", ""),
                            "emoji": row.get("Emoji", ""),
                        }
        print(f"  Loaded {len(apps)} apps from APPS.md")
        return apps
    except Exception as e:
        print(f"  Error loading APPS.md: {e}")
        return {}


def enrich_app_data(app: Dict, apps_metadata: Dict[str, Dict]) -> Dict:
    """Enrich Tinybird app data with metadata from APPS.md."""
    username = app.get("username", "")
    enriched = app.copy()
    
    if username and username in apps_metadata:
        metadata = apps_metadata[username]
        enriched["display_name"] = metadata.get("name") or app.get("hostname", "")
        enriched["url"] = metadata.get("url", "")
        enriched["description"] = metadata.get("description", "")
        enriched["category"] = metadata.get("category", "")
        enriched["emoji"] = metadata.get("emoji", "")
        print(f"  Enriched: {metadata.get('name', 'unknown')} (@{username})")
    else:
        enriched["display_name"] = app.get("hostname", "Unknown App")
        enriched["url"] = f"https://{app.get('hostname', '')}"
        print(f"  No metadata for @{username}, using hostname")
    
    return enriched


def load_trending_history(github_token: str) -> list:
    """Load trending app history from news branch."""
    history = read_news_file(TRENDING_HISTORY_FILE, github_token, OWNER, REPO)
    if isinstance(history, list):
        return history
    return history.get("apps", []) if isinstance(history, dict) else []


def is_duplicate(app: Dict, history: list) -> bool:
    """Check if app was featured in last 4 weeks by date."""
    hostname = app.get("hostname", "")
    username = app.get("username", "")
    cutoff = datetime.now(timezone.utc) - timedelta(days=28)
    for entry in history:
        featured_at = entry.get("featured_at", "")
        if not featured_at:
            continue
        try:
            entry_date = datetime.fromisoformat(featured_at.replace('Z', '+00:00'))
            if entry_date < cutoff:
                continue
            if entry.get("hostname") == hostname or entry.get("username") == username:
                print(f"  App featured in last 4 weeks - skipping")
                return True
        except ValueError:
            continue
    return False


def generate_content(app: Dict, token: str, verbose: bool) -> Optional[Dict]:
    """Generate Discord post content using Pollinations AI."""
    system_prompt = load_prompt("trending_app")
    user_prompt = f"""Top app this week:
App Name: {app.get('display_name', app.get('hostname', 'unknown'))}
Username: @{app.get('username', 'unknown')}
URL: {app.get('url', 'N/A')}
Description: {app.get('description', 'An amazing app built with Pollinations AI')}
Category: {app.get('category', 'General')}
Request Count: {app.get('request_count', 0):,} requests this week
Generate a celebratory Discord post highlighting this awesome community app!"""

    response = call_pollinations_api(system_prompt, user_prompt, token, temperature=0.8, verbose=verbose)
    if not response:
        return None
    try:
        return json.loads(response.strip())
    except json.JSONDecodeError as e:
        print(f"  JSON error: {e}")
        return None


def commit_artifacts(date_str: str, app: Dict, content: Dict, image_bytes: bytes, github_token: str) -> Optional[str]:
    """Commit post JSON and image to news branch. Returns image URL if committed."""
    base_path = f"social/news/trending/{date_str}"
    image_url = f"https://raw.githubusercontent.com/{OWNER}/{REPO}/{NEWS_BRANCH}/{base_path}/image.jpg" if image_bytes else None
    post_data = {
        "date": date_str,
        "app": app,
        "content": content,
        "images": [{"url": image_url}] if image_url else [],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    commit_files_to_branch(
        [(f"{base_path}/post.json", post_data)],
        NEWS_BRANCH, github_token, OWNER, REPO, f"trending {date_str}"
    )
    if image_bytes:
        return commit_image_to_branch(
            image_bytes, f"{base_path}/image.jpg", NEWS_BRANCH, github_token, OWNER, REPO
        )
    return None


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
    # Fix Windows console encoding for Unicode (emojis)
    if sys.platform == "win32":
        import codecs
        sys.stdout = codecs.getwriter("utf-8")(sys.stdout.buffer, "strict")
        sys.stderr = codecs.getwriter("utf-8")(sys.stderr.buffer, "strict")
    
    print("=" * 60)
    print("App of the Week - Trending App Generator")
    print("=" * 60)
    
    dry_run = os.getenv("DRY_RUN", "").lower() in ("1", "true", "yes")
    if dry_run:
        print("\n[DRY RUN MODE] No actual API calls will be made\n")
    
    pollinations_token = get_env("POLLINATIONS_API_KEY", required=not dry_run)
    tinybird_token = get_env("TINYBIRD_READ_TOKEN", required=not dry_run)
    github_token = get_env("GITHUB_TOKEN", required=not dry_run)
    discord_webhook = get_env("DISCORD_WEBHOOK_URL", required=False)
    verbose = os.getenv("VERBOSE", "").lower() in ("1", "true", "yes")
    
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    # Load APPS.md metadata
    print("\n1. Loading APPS.md metadata...")
    if dry_run:
        print("  [DRY RUN] Using mock metadata")
        apps_metadata = {
            "CoolDev123": {
                "name": "Cool AI App",
                "url": "https://cool-ai-app.example.com",
                "description": "An amazing AI-powered creativity tool",
                "category": "image",
                "emoji": "🎨"
            }
        }
    else:
        apps_metadata = load_apps_metadata(repo_root)
    
    # Query Tinybird
    print("\n2. Querying Tinybird...")
    if dry_run:
        print("  [DRY RUN] Using mock app data")
        top_app = {
            "hostname": "cool-ai-app.example.com",
            "username": "CoolDev123",
            "request_count": 15420,
            "last_seen": "2026-03-30T10:00:00Z"
        }
    else:
        top_app = query_tinybird_top_app(tinybird_token)
    
    if not top_app:
        print("  No app data available - exiting")
        sys.exit(1)
    
    # Enrich with APPS.md
    print("\n3. Enriching app data...")
    top_app = enrich_app_data(top_app, apps_metadata)
    
    # Check history
    print("\n4. Checking history...")
    if dry_run:
        print("  [DRY RUN] Using empty history")
        history = []
    else:
        history = load_trending_history(github_token)
    
    if is_duplicate(top_app, history):
        print("  App is duplicate - would skip in production")
        if not dry_run:
            sys.exit(0)
    
    # Generate content
    print("\n5. Generating content...")
    if dry_run:
        print("  [DRY RUN] Using mock content")
        content = {
            "headline": "🎨 Cool AI App - App of the Week!",
            "message": ("This week we're celebrating @CoolDev123's amazing app with 15,420 requests! "
                       "The community loves what you've built - keep shipping! 🚀"),
            "image_prompt": ("Cozy pixel art scene showing a glowing AI app interface inside a Polaroid "
                            "photo frame. Warm pastel colors with lime green #ecf874 accents. Handwritten "
                            "'App of the Week' text at top. App name 'Cool AI App' written below in cute "
                            "handwritten font. Magical sparkles and soft glow effects. 8-bit aesthetic, "
                            "chunky pixels, lo-fi vibes like Stardew Valley.")
        }
    else:
        content = generate_content(top_app, pollinations_token, verbose)
    
    if not content:
        print("  Content generation failed - exiting")
        sys.exit(1)
    
    print(f"  Headline: {content.get('headline', '')}")
    
    # Generate image
    print("\n6. Generating image...")
    if dry_run:
        print("  [DRY RUN] Skipping image generation")
        image_bytes = None
    else:
        image_bytes, _ = generate_image(content.get("image_prompt", ""), pollinations_token)
        if image_bytes:
            print(f"  Image: {len(image_bytes):,} bytes")
    
    # Commit artifacts
    print("\n7. Committing artifacts...")
    image_url = None
    if dry_run:
        print(f"  [DRY RUN] Would commit to: social/news/trending/{date_str}/")
        print(f"    - post.json")
        print(f"    - image.jpg (if generated)")
        print(f"    - Update {TRENDING_HISTORY_FILE}")
    else:
        image_url = commit_artifacts(date_str, top_app, content, image_bytes, github_token)
    
    # Post to Discord
    if discord_webhook or dry_run:
        print("\n8. Posting to Discord...")
        msg = f"**{content.get('headline', 'App of the Week')}**\n\n{content.get('message', '')}"
        print(f"  Message preview:\n{msg[:200]}...")
        if dry_run:
            print("  [DRY RUN] Would post to Discord webhook")
        else:
            post_to_discord(discord_webhook, msg, image_url)
    
    # Update history
    print("\n9. Updating history...")
    if dry_run:
        print("  [DRY RUN] Would update trending history")
    else:
        update_history(history, top_app, github_token)
    
    print("\n" + "=" * 60)
    print("Done!")
    print("=" * 60)


if __name__ == "__main__":
    main()
