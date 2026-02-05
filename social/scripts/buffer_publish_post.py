#!/usr/bin/env python3
"""
Buffer Publish Post - Publishes posts to LinkedIn/Twitter/Instagram via Buffer GraphQL API
Triggered when a post PR is merged
"""

import os
import sys
import json
import time
import requests
import yaml
from typing import Optional
from datetime import datetime, timezone, timedelta

from common import get_env
from buffer_utils import (
    get_channel_by_service,
    create_buffer_post,
)

SCHEDULE_FILE = os.path.join(os.path.dirname(__file__), "..", "buffer-schedule.yml")

MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds


def get_next_scheduled_time(platform: str) -> Optional[str]:
    """Read buffer-schedule.yml and return the next scheduled posting time as ISO 8601.

    Finds the next valid day+time slot for the given platform.
    Returns None if schedule file is missing (falls back to immediate posting).
    """
    try:
        with open(SCHEDULE_FILE, "r") as f:
            schedule = yaml.safe_load(f)
    except (FileNotFoundError, yaml.YAMLError) as e:
        print(f"Warning: Could not read schedule file: {e}")
        return None

    platform_schedule = schedule.get(platform)
    if not platform_schedule:
        print(f"Warning: No schedule found for {platform}")
        return None

    allowed_days = platform_schedule.get("days", [1, 2, 3, 4, 5, 6, 7])
    preferred_time = platform_schedule.get("preferred", "17:00")
    hour, minute = map(int, preferred_time.split(":"))

    now = datetime.now(timezone.utc)

    # Check today and the next 7 days to find a valid slot
    for days_ahead in range(8):
        candidate = now + timedelta(days=days_ahead)
        # isoweekday(): Monday=1, Sunday=7 (matches our YAML format)
        if candidate.isoweekday() not in allowed_days:
            continue

        scheduled = candidate.replace(hour=hour, minute=minute, second=0, microsecond=0)
        # Must be at least 10 minutes in the future
        if scheduled > now + timedelta(minutes=10):
            iso_time = scheduled.strftime("%Y-%m-%dT%H:%M:%SZ")
            print(f"Scheduled for: {iso_time}")
            return iso_time

    print("Warning: Could not find a valid schedule slot")
    return None


def create_buffer_post_with_retry(
    access_token: str,
    channel_id: str,
    text: str,
    media: Optional[dict] = None,
    scheduled_at: Optional[str] = None,
) -> dict:
    """Create a Buffer post with retry logic for rate limits.

    Retries on LimitReachedError responses from the GraphQL API.
    """
    for attempt in range(MAX_RETRIES):
        result = create_buffer_post(
            access_token=access_token,
            channel_id=channel_id,
            text=text,
            media=media,
            scheduled_at=scheduled_at,
            now=not scheduled_at,
        )

        if result.get("success"):
            return result

        error = result.get("error", "")
        # Retry on rate limit errors
        if "limit" in error.lower() or "rate" in error.lower():
            if attempt < MAX_RETRIES - 1:
                print(f"Rate limited, waiting {RETRY_DELAY}s before retry {attempt + 2}/{MAX_RETRIES}...")
                time.sleep(RETRY_DELAY)
                continue

        # Non-retryable error or max retries reached
        return result

    return {"success": False, "error": "Max retries exceeded"}


def publish_linkedin_post(post_data: dict, access_token: str) -> bool:
    """Publish a LinkedIn post via Buffer (scheduled delivery)"""
    channel = get_channel_by_service(access_token, "linkedin")
    if not channel:
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

    print(f"Publishing to LinkedIn ({channel.get('displayName', 'unknown')})...")
    print(f"Post preview ({len(text)} chars):")
    print(f"---\n{text[:500]}{'...' if len(text) > 500 else ''}\n---")

    # Get image URL if available
    media = None
    image_data = post_data.get("image")
    if image_data and image_data.get("url"):
        media = {"photo": image_data["url"]}
        print(f"Including image: {image_data['url'][:100]}...")

    # Calculate next scheduled posting time
    scheduled_at = get_next_scheduled_time("linkedin")

    result = create_buffer_post_with_retry(
        access_token=access_token,
        channel_id=channel["id"],
        text=text,
        media=media,
        scheduled_at=scheduled_at,
    )

    if result.get("success"):
        print(f"Successfully {'scheduled' if scheduled_at else 'published'} to LinkedIn!")
        return True
    else:
        print(f"Failed to publish: {result.get('error', 'Unknown error')}")
        return False


def publish_twitter_post(post_data: dict, access_token: str) -> bool:
    """Publish a Twitter/X post via Buffer (scheduled delivery)"""
    # Try both "twitter" and "x" service names (Buffer may use either)
    channel = get_channel_by_service(access_token, "twitter")
    if not channel:
        channel = get_channel_by_service(access_token, "x")
    if not channel:
        return False

    # Get the tweet text
    text = post_data.get("full_tweet", post_data.get("tweet", ""))

    # Ensure under 280 chars
    if len(text) > 280:
        print(f"Warning: Tweet is {len(text)} chars, truncating...")
        text = text[:277] + "..."

    print(f"Publishing to Twitter/X ({channel.get('displayName', 'unknown')})...")
    print(f"Tweet ({len(text)} chars):")
    print(f"---\n{text}\n---")

    # Get image URL if available
    media = None
    image_data = post_data.get("image")
    if image_data and image_data.get("url"):
        media = {"photo": image_data["url"]}
        print(f"Including image: {image_data['url'][:100]}...")

    # Calculate next scheduled posting time
    scheduled_at = get_next_scheduled_time("twitter")

    result = create_buffer_post_with_retry(
        access_token=access_token,
        channel_id=channel["id"],
        text=text,
        media=media,
        scheduled_at=scheduled_at,
    )

    if result.get("success"):
        print(f"Successfully {'scheduled' if scheduled_at else 'published'} to Twitter/X!")
        return True
    else:
        print(f"Failed to publish: {result.get('error', 'Unknown error')}")
        return False


def publish_instagram_post(post_data: dict, access_token: str) -> bool:
    """Publish an Instagram post via Buffer (scheduled delivery)"""
    channel = get_channel_by_service(access_token, "instagram")
    if not channel:
        return False

    # Build caption from caption + hashtags
    caption = post_data.get("caption", "")
    hashtags = post_data.get("hashtags", [])
    text = caption
    if hashtags:
        text += "\n\n" + " ".join(hashtags)

    # Instagram caption limit is 2200 chars
    if len(text) > 2200:
        text = text[:2197] + "..."

    print(f"Publishing to Instagram ({channel.get('displayName', 'unknown')})...")
    print(f"Caption ({len(text)} chars):")
    print(f"---\n{text[:500]}{'...' if len(text) > 500 else ''}\n---")

    # Get image URLs from images array
    media = None
    images = post_data.get("images", [])
    image_urls = [img.get("url") for img in images if img.get("url")]
    if image_urls:
        media = {"photos": image_urls}
        print(f"Including {len(image_urls)} image(s)")

    # Calculate next scheduled posting time
    scheduled_at = get_next_scheduled_time("instagram")

    result = create_buffer_post_with_retry(
        access_token=access_token,
        channel_id=channel["id"],
        text=text,
        media=media,
        scheduled_at=scheduled_at,
    )

    if result.get("success"):
        print(f"Successfully {'scheduled' if scheduled_at else 'published'} to Instagram!")
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


def get_post_file_from_pr(github_token: str, repo: str, pr_number: int) -> Optional[str]:
    """Get the post file path from a PR's changed files"""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    response = requests.get(
        f"https://api.github.com/repos/{repo}/pulls/{pr_number}/files",
        headers=headers,
        timeout=30
    )

    if response.status_code != 200:
        print(f"Error fetching PR files: {response.status_code}")
        return None

    files = response.json()
    for file_info in files:
        filename = file_info.get("filename", "")
        if (filename.startswith("social/news/transformed/linkedin/posts/") or
            filename.startswith("social/news/transformed/twitter/posts/") or
            filename.startswith("social/news/transformed/instagram/posts/")) and \
           filename.endswith(".json"):
            return filename

    return None


def main():
    buffer_token = get_env("BUFFER_ACCESS_TOKEN")
    github_token = get_env("GITHUB_TOKEN")
    repo = get_env("GITHUB_REPOSITORY")

    # Post file can be provided directly (workflow_dispatch) or detected from PR
    post_file_path = get_env("POST_FILE_PATH", required=False)
    pr_number_str = get_env("PR_NUMBER", required=False)
    pr_number = int(pr_number_str) if pr_number_str else None

    # These are guaranteed non-None by get_env with required=True
    assert buffer_token is not None
    assert github_token is not None
    assert repo is not None

    # If no post file provided, detect from PR
    if not post_file_path and pr_number:
        print(f"Detecting post file from PR #{pr_number}...")
        post_file_path = get_post_file_from_pr(github_token, repo, pr_number)
        if not post_file_path:
            print(f"Error: No LinkedIn, Twitter, or Instagram post file found in PR #{pr_number}")
            sys.exit(1)
        print(f"Found: {post_file_path}")

    if not post_file_path:
        print("Error: POST_FILE_PATH not provided and no PR_NUMBER to detect from")
        sys.exit(1)

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
        elif "instagram" in post_file_path.lower():
            platform = "instagram"
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
    elif platform == "instagram":
        success = publish_instagram_post(post_data, buffer_token)
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
            f"Sent to {platform.title()} via Buffer at {timestamp}. Check Buffer dashboard for delivery status."
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
