#!/usr/bin/env python3
"""Generate 'App of the Week' post for Discord. Runs Wednesdays 06:00 UTC."""

import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (
    OWNER,
    REPO,
    GISTS_BRANCH as NEWS_BRANCH,
    call_pollinations_api,
    commit_files_to_branch,
    commit_image_to_branch,
    generate_image,
    get_env,
    load_prompt,
    parse_json_response,
    read_news_file,
)
from publish_weekly import post_to_discord

TINYBIRD_BASE_URL = "https://api.europe-west2.gcp.tinybird.co/v0"
TRENDING_HISTORY_FILE = "social/news/trending/trending_app_history.json"
RECENT_FEATURE_WINDOW_DAYS = 28


def query_tinybird_top_apps(token: str) -> list[Dict]:
    """Query Tinybird for the top registered apps this week."""
    import requests

    url = f"{TINYBIRD_BASE_URL}/pipes/app_top_weekly.json"
    try:
        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        if response.status_code != 200:
            print(f"  Tinybird API error: {response.status_code}")
            print(f"  Response: {response.text[:200]}")
            return []

        apps = response.json().get("data", [])
        if not apps:
            print("  No registered apps found")
            return []

        print(f"  Found {len(apps)} candidate apps")
        for app in apps[:3]:
            app_name = app.get("app_name", "unknown")
            requests = app.get("request_count", 0)
            print(f"    - {app_name}: {requests:,} requests")
        return apps
    except Exception as e:
        print(f"  Error: {e}")
        return []


def load_trending_history(github_token: str) -> list:
    """Load trending app history from news branch."""
    history = read_news_file(TRENDING_HISTORY_FILE, github_token, OWNER, REPO)
    if isinstance(history, list):
        return history
    return history.get("apps", []) if isinstance(history, dict) else []


def is_duplicate(app: Dict, history: list) -> bool:
    """Check if app was featured recently, keyed by app URL."""
    app_url = app.get("app_url", "")
    app_name = app.get("app_name", "")
    cutoff = datetime.now(timezone.utc) - timedelta(days=RECENT_FEATURE_WINDOW_DAYS)

    for entry in history:
        featured_at = entry.get("featured_at", "")
        if not featured_at:
            continue

        try:
            entry_date = datetime.fromisoformat(featured_at.replace("Z", "+00:00"))
        except ValueError:
            continue

        if entry_date < cutoff:
            continue

        if entry.get("app_url") == app_url:
            return True
        if app_name and entry.get("app_name") == app_name:
            return True

    return False


def pick_top_app(candidates: list[Dict], history: list) -> Optional[Dict]:
    """Pick the highest-ranked app that has not been featured recently."""
    for app in candidates:
        if not is_duplicate(app, history):
            return app
        print(f"  Skipping recent feature: {app.get('app_name', app.get('app_url', 'unknown'))}")
    return None


def generate_content(app: Dict, token: str, verbose: bool) -> Optional[Dict]:
    """Generate Discord post content using Pollinations AI."""
    system_prompt = load_prompt("trending_app")
    owner = app.get("owner") or "unknown"
    user_prompt = f"""Top registered app this week:
App Name: {app.get('app_name', app.get('app_url', 'unknown'))}
Owner: @{owner}
App URL: {app.get('app_url', 'N/A')}
Request Count: {app.get('request_count', 0):,} verified app-attributed requests this week
Measurement Basis: redirect-auth / BYOP traffic mapped to the registered app
Last Seen: {app.get('last_seen', 'unknown')}

Write a short Discord post about this app-of-the-week result. Do not invent product details that are not supported by the name or URL."""

    response = call_pollinations_api(
        system_prompt,
        user_prompt,
        token,
        temperature=0.8,
        verbose=verbose,
        exit_on_failure=False,
    )
    return parse_json_response(response) if response else None


def commit_artifacts(
    date_str: str,
    app: Dict,
    content: Dict,
    image_bytes: bytes,
    github_token: str,
) -> Optional[str]:
    """Commit post JSON and image to news branch. Returns image URL if committed."""
    base_path = f"social/news/trending/{date_str}"
    image_url = (
        f"https://raw.githubusercontent.com/{OWNER}/{REPO}/{NEWS_BRANCH}/{base_path}/image.jpg"
        if image_bytes
        else None
    )
    post_data = {
        "date": date_str,
        "app": app,
        "content": content,
        "images": [{"url": image_url}] if image_url else [],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    commit_files_to_branch(
        [(f"{base_path}/post.json", post_data)],
        NEWS_BRANCH,
        github_token,
        OWNER,
        REPO,
        f"trending {date_str}",
    )
    if image_bytes:
        return commit_image_to_branch(
            image_bytes,
            f"{base_path}/image.jpg",
            NEWS_BRANCH,
            github_token,
            OWNER,
            REPO,
        )
    return None


def update_history(history: list, app: Dict, github_token: str):
    """Save updated trending history."""
    entry = {
        "app_url": app.get("app_url", ""),
        "app_name": app.get("app_name", ""),
        "owner": app.get("owner", ""),
        "request_count": app.get("request_count", 0),
        "featured_at": datetime.now(timezone.utc).isoformat(),
    }
    history.append(entry)
    commit_files_to_branch(
        [(TRENDING_HISTORY_FILE, history[-12:])],
        NEWS_BRANCH,
        github_token,
        OWNER,
        REPO,
        "history",
    )


def main():
    """Main entry point."""
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

    print("\n1. Querying Tinybird...")
    if dry_run:
        print("  [DRY RUN] Using mock app data")
        candidates = [
            {
                "app_url": "https://cool-ai-app.example.com",
                "app_name": "Cool AI App",
                "owner": "CoolDev123",
                "request_count": 15420,
                "last_seen": "2026-03-30 10:00:00",
            }
        ]
    else:
        candidates = query_tinybird_top_apps(tinybird_token)

    if not candidates:
        print("  No app data available - exiting")
        sys.exit(1)

    print("\n2. Checking history...")
    if dry_run:
        print("  [DRY RUN] Using empty history")
        history = []
    else:
        history = load_trending_history(github_token)

    top_app = pick_top_app(candidates, history)
    if not top_app:
        print("  All top apps were featured recently - exiting")
        sys.exit(0)

    print(
        f"  Selected: {top_app.get('app_name', top_app.get('app_url', 'unknown'))} "
        f"({top_app.get('request_count', 0):,} requests)"
    )

    print("\n3. Generating content...")
    if dry_run:
        print("  [DRY RUN] Using mock content")
        content = {
            "headline": "Cool AI App moved 15k",
            "message": (
                "Cool AI App pushed 15,420 verified app-attributed requests this week. "
                "That is enough to notice."
            ),
            "image_prompt": (
                "Cozy pixel art scene of a busy indie AI app dashboard inside a Polaroid "
                "photo frame. Handwritten 'App of the Week' caption at top, app name "
                "'Cool AI App' below. Warm pastel colors with lime green #ecf874 accents, "
                "soft glow, chunky 8-bit pixels, lo-fi atmosphere."
            ),
        }
    else:
        content = generate_content(top_app, pollinations_token, verbose)

    if not content:
        print("  Content generation failed - exiting")
        sys.exit(1)

    print(f"  Headline: {content.get('headline', '')}")

    print("\n4. Generating image...")
    if dry_run:
        print("  [DRY RUN] Skipping image generation")
        image_bytes = None
    else:
        image_bytes, _ = generate_image(content.get("image_prompt", ""), pollinations_token)
        if image_bytes:
            print(f"  Image: {len(image_bytes):,} bytes")

    print("\n5. Committing artifacts...")
    image_url = None
    if dry_run:
        print(f"  [DRY RUN] Would commit to: social/news/trending/{date_str}/")
        print("    - post.json")
        print("    - image.jpg (if generated)")
        print(f"    - Update {TRENDING_HISTORY_FILE}")
    else:
        image_url = commit_artifacts(date_str, top_app, content, image_bytes, github_token)

    if discord_webhook or dry_run:
        print("\n6. Posting to Discord...")
        msg = f"**{content.get('headline', 'App of the Week')}**\n\n{content.get('message', '')}"
        print(f"  Message preview:\n{msg[:200]}...")
        if dry_run:
            print("  [DRY RUN] Would post to Discord webhook")
        else:
            post_to_discord(discord_webhook, msg, image_url)

    print("\n7. Updating history...")
    if dry_run:
        print("  [DRY RUN] Would update trending history")
    else:
        update_history(history, top_app, github_token)

    print("\n" + "=" * 60)
    print("Done!")
    print("=" * 60)


if __name__ == "__main__":
    main()
