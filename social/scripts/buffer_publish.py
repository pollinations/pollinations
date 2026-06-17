#!/usr/bin/env python3
"""
Buffer Stage Post - Stages posts to LinkedIn/Twitter/Instagram via Buffer GraphQL API
Triggered when a post PR is merged
"""

import os
import json
import time
import requests
import yaml
from typing import Optional
from datetime import datetime, timezone, timedelta

from common import (
    LINKEDIN_MAX_CHARS,
    get_env,
    get_post_image_urls,
)
from buffer_utils import (
    get_channel_by_service,
    create_buffer_post,
)

SCHEDULE_FILE = os.path.join(os.path.dirname(__file__), "..", "buffer-schedule.yml")

MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds


def verify_image_urls(urls: list, max_retries: int = 6, delay: int = 10) -> bool:
    """Verify all image URLs are accessible, retrying for CDN propagation."""
    for attempt in range(max_retries):
        all_ok = True
        for url in urls:
            try:
                resp = requests.head(url, timeout=10, allow_redirects=True)
                if resp.status_code != 200:
                    all_ok = False
                    break
            except requests.RequestException:
                all_ok = False
                break
        if all_ok:
            print(f"All {len(urls)} image URL(s) verified accessible")
            return True
        if attempt < max_retries - 1:
            print(f"Image URL not yet accessible (attempt {attempt + 1}/{max_retries}), waiting {delay}s...")
            time.sleep(delay)
    print(f"Warning: Image URLs not accessible after {max_retries} attempts")
    return False


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
    metadata: Optional[dict] = None,
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
            metadata=metadata,
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


def _instagram_metadata(post_data: dict, image_urls: list) -> dict:
    """Build Instagram post/carousel metadata block."""
    metadata_block = post_data.get("metadata") or {}
    stored_post_type = metadata_block.get("post_type")
    if stored_post_type == "carousel" or len(image_urls) > 1:
        instagram_type = "carousel"
    else:
        instagram_type = "post"
    print(f"Instagram post type: {instagram_type}")
    # Verified against Buffer GraphQL introspection: InstagramPostMetadataInput.type uses PostType,
    # and PostType includes "post", "story", "reel", and "carousel".
    return {
        "instagram": {
            "type": instagram_type,
            "shouldShareToFeed": True,
        }
    }


def publish_post(
    post_data: dict,
    access_token: str,
    *,
    label: str,
    services: tuple,
    max_chars: int,
    on_overflow: str = "reject",
    multi_image: bool = False,
    metadata_fn=None,
) -> bool:
    """Publish a post to one Buffer service (scheduled delivery).

    Config-driven across LinkedIn/Twitter/Instagram. The per-service divergences:
    - services: fallback service aliases tried in order (e.g. ("twitter", "x"))
    - max_chars / on_overflow: "reject" returns False when over limit (LinkedIn);
      "truncate" clips to max_chars-3 + "..." (Twitter/Instagram)
    - multi_image: False sends {"photo": urls[0]}; True sends {"photos": urls} (carousel)
    - metadata_fn: optional builder for the Buffer metadata block (Instagram only)
    """
    channel = None
    for service in services:
        channel = get_channel_by_service(access_token, service)
        if channel:
            break
    if not channel:
        return False

    text = (post_data.get("text") or "").strip()
    if not text:
        print(f"Failed to publish: {label} post text is empty")
        return False

    char_count = len(text)
    if char_count > max_chars:
        if on_overflow == "reject":
            print(
                f"Failed to publish: {label} post is {char_count} chars, exceeds Buffer limit of {max_chars}"
            )
            return False
        # truncate
        print(f"Warning: {label} post is {char_count} chars, truncating...")
        text = text[: max_chars - 3] + "..."

    print(f"Publishing to {label} ({channel.get('displayName', 'unknown')})...")
    print(f"Post preview ({len(text)} chars):")
    print(f"---\n{text[:500]}{'...' if len(text) > 500 else ''}\n---")

    # Get image URL(s) if available
    media = None
    metadata = None
    image_urls = get_post_image_urls(post_data)
    if image_urls:
        if multi_image:
            media = {"photos": image_urls}
            print(f"Including {len(image_urls)} image(s)")
        else:
            media = {"photo": image_urls[0]}
            print(f"Including image: {image_urls[0][:100]}...")

    if metadata_fn:
        metadata = metadata_fn(post_data, image_urls)

    # Verify image URLs are accessible (CDN propagation)
    if image_urls:
        verify_image_urls(image_urls if multi_image else [image_urls[0]])

    # Calculate next scheduled posting time (keyed by primary service name)
    scheduled_at = get_next_scheduled_time(services[0])

    result = create_buffer_post_with_retry(
        access_token=access_token,
        channel_id=channel["id"],
        text=text,
        media=media,
        metadata=metadata,
        scheduled_at=scheduled_at,
    )

    if result.get("success"):
        print(f"Successfully {'scheduled' if scheduled_at else 'published'} to {label}!")
        return True
    else:
        print(f"Failed to publish: {result.get('error', 'Unknown error')}")
        return False


def publish_linkedin_post(post_data: dict, access_token: str) -> bool:
    """Publish a LinkedIn post via Buffer (rejects over-limit posts)."""
    return publish_post(
        post_data,
        access_token,
        label="LinkedIn",
        services=("linkedin",),
        max_chars=LINKEDIN_MAX_CHARS,
        on_overflow="reject",
    )


def publish_twitter_post(post_data: dict, access_token: str) -> bool:
    """Publish a Twitter/X post via Buffer (truncates over-limit posts)."""
    return publish_post(
        post_data,
        access_token,
        label="Twitter/X",
        # Try both "twitter" and "x" service names (Buffer may use either)
        services=("twitter", "x"),
        max_chars=280,
        on_overflow="truncate",
    )


def publish_instagram_post(post_data: dict, access_token: str) -> bool:
    """Publish an Instagram post/carousel via Buffer (truncates over-limit captions)."""
    return publish_post(
        post_data,
        access_token,
        label="Instagram",
        services=("instagram",),
        max_chars=2200,
        on_overflow="truncate",
        multi_image=True,
        metadata_fn=_instagram_metadata,
    )
