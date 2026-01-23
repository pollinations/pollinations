#!/usr/bin/env python3
"""
Buffer Publish Post - Publishes posts to LinkedIn/Twitter via Buffer API
Triggered when a post PR is merged
"""

import os
import sys
import json
import requests
from typing import Optional
from datetime import datetime, timezone

# Buffer API
BUFFER_API_BASE = "https://api.bufferapp.com/1"


def get_env(key: str, required: bool = True) -> Optional[str]:
    """Get environment variable with optional requirement check"""
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def get_buffer_profile(access_token: str, service: str) -> Optional[dict]:
    """Get Buffer profile for a specific service"""
    response = requests.get(
        f"{BUFFER_API_BASE}/profiles.json",
        params={"access_token": access_token},
        timeout=30
    )

    if response.status_code != 200:
        print(f"Error fetching profiles: {response.status_code} - {response.text[:500]}")
        return None

    profiles = response.json()
    for profile in profiles:
        if profile.get("service") == service:
            return profile

    print(f"No {service} profile found in Buffer account")
    return None


def create_buffer_update(
    access_token: str,
    profile_id: str,
    text: str,
    media: Optional[dict] = None,
    now: bool = True
) -> dict:
    """Create a Buffer update (post)"""
    data = {
        "access_token": access_token,
        "text": text,
        "profile_ids[]": [profile_id],
    }

    if media:
        for key, value in media.items():
            if value:
                data[f"media[{key}]"] = value

    if now:
        data["now"] = "true"

    response = requests.post(
        f"{BUFFER_API_BASE}/updates/create.json",
        data=data,
        timeout=60
    )

    if response.status_code != 200:
        print(f"Error creating update: {response.status_code} - {response.text[:500]}")
        return {"success": False, "error": response.text}

    return response.json()


def publish_linkedin_post(post_data: dict, access_token: str) -> bool:
    """Publish a LinkedIn post via Buffer"""
    profile = get_buffer_profile(access_token, "linkedin")
    if not profile:
        return False

    # Get the full post text
    text = post_data.get("full_post", "")
    if not text:
        # Build from parts
        text = post_data.get("hook", "") + "\n\n" + post_data.get("body", "")
        if post_data.get("cta"):
            text += "\n\n" + post_data["cta"]
        hashtags = post_data.get("hashtags", [])
        if hashtags:
            text += "\n\n" + " ".join(hashtags[:5])

    print(f"Publishing to LinkedIn (@{profile.get('service_username', 'unknown')})...")
    print(f"Post preview ({len(text)} chars):")
    print(f"---\n{text[:500]}{'...' if len(text) > 500 else ''}\n---")

    result = create_buffer_update(
        access_token=access_token,
        profile_id=profile["id"],
        text=text,
        now=True
    )

    if result.get("success"):
        print(f"Successfully published to LinkedIn!")
        return True
    else:
        print(f"Failed to publish: {result.get('error', 'Unknown error')}")
        return False


def publish_twitter_post(post_data: dict, access_token: str) -> bool:
    """Publish a Twitter/X post via Buffer"""
    profile = get_buffer_profile(access_token, "twitter")
    if not profile:
        return False

    # Get the tweet text
    text = post_data.get("full_tweet", post_data.get("tweet", ""))

    # Ensure under 280 chars
    if len(text) > 280:
        print(f"Warning: Tweet is {len(text)} chars, truncating...")
        text = text[:277] + "..."

    print(f"Publishing to Twitter/X (@{profile.get('service_username', 'unknown')})...")
    print(f"Tweet ({len(text)} chars):")
    print(f"---\n{text}\n---")

    result = create_buffer_update(
        access_token=access_token,
        profile_id=profile["id"],
        text=text,
        now=True
    )

    if result.get("success"):
        print(f"Successfully published to Twitter/X!")
        return True
    else:
        print(f"Failed to publish: {result.get('error', 'Unknown error')}")
        return False


def add_pr_comment(github_token: str, repo: str, pr_number: int, message: str):
    """Add a comment to the PR"""
    if not pr_number:
        return

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    response = requests.post(
        f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments",
        headers=headers,
        json={"body": message}
    )

    if response.status_code in [200, 201]:
        print(f"Added comment to PR #{pr_number}")
    else:
        print(f"Warning: Could not add PR comment: {response.status_code}")


def main():
    buffer_token = get_env("BUFFER_ACCESS_TOKEN")
    github_token = get_env("GITHUB_TOKEN")
    repo = get_env("GITHUB_REPOSITORY")
    post_file_path = get_env("POST_FILE_PATH")
    pr_number_str = get_env("PR_NUMBER", required=False)
    pr_number = int(pr_number_str) if pr_number_str else None

    # Read the post file
    print(f"\n=== Reading post file: {post_file_path} ===")
    try:
        with open(post_file_path, "r", encoding="utf-8") as f:
            post_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: Post file not found: {post_file_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in post file: {e}")
        sys.exit(1)

    # Determine platform from file path or post data
    platform = post_data.get("platform", "")
    if not platform:
        if "linkedin" in post_file_path.lower():
            platform = "linkedin"
        elif "twitter" in post_file_path.lower():
            platform = "twitter"
        else:
            print(f"Error: Could not determine platform from path: {post_file_path}")
            sys.exit(1)

    print(f"Platform: {platform}")
    print(f"Post date: {post_data.get('date', 'unknown')}")

    # Publish based on platform
    success = False
    if platform == "linkedin":
        success = publish_linkedin_post(post_data, buffer_token)
    elif platform == "twitter":
        success = publish_twitter_post(post_data, buffer_token)
    else:
        print(f"Error: Unknown platform: {platform}")
        sys.exit(1)

    # Add PR comment with result
    if success:
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        add_pr_comment(
            github_token,
            repo,
            pr_number,
            f"Published to {platform.title()} via Buffer at {timestamp}"
        )
        print("\n=== Success! ===")
    else:
        add_pr_comment(
            github_token,
            repo,
            pr_number,
            f"Failed to publish to {platform.title()} via Buffer. Check workflow logs."
        )
        print("\n=== Failed ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
