#!/usr/bin/env python3
"""
Buffer API Utilities - Shared utilities for posting to LinkedIn and Twitter via Buffer
https://buffer.com/developers/api
"""

import requests
from typing import Dict, List, Optional

from common import get_env


BUFFER_API_BASE = "https://api.bufferapp.com/1"


def get_buffer_profiles(access_token: str) -> List[Dict]:
    """Fetch all Buffer profiles for the authenticated user

    Returns list of profiles with id, service, service_username, etc.
    """
    response = requests.get(
        f"{BUFFER_API_BASE}/profiles.json",
        params={"access_token": access_token},
        timeout=30
    )

    if response.status_code != 200:
        print(f"Error fetching profiles: {response.status_code} - {response.text[:500]}")
        return []

    return response.json()


def get_profile_by_service(access_token: str, service: str) -> Optional[Dict]:
    """Get a specific profile by service name (twitter, linkedin, etc.)

    Args:
        access_token: Buffer API access token
        service: Service name ('twitter', 'linkedin', 'instagram', etc.)

    Returns:
        Profile dict or None if not found
    """
    profiles = get_buffer_profiles(access_token)

    for profile in profiles:
        if profile.get("service") == service:
            return profile

    print(f"No {service} profile found in Buffer account")
    return None


def create_buffer_update(
    access_token: str,
    profile_ids: List[str],
    text: str,
    media: Optional[Dict] = None,
    scheduled_at: Optional[str] = None,
    now: bool = False
) -> Dict:
    """Create a Buffer update (post) for one or more profiles

    Args:
        access_token: Buffer API access token
        profile_ids: List of Buffer profile IDs to post to
        text: The post text content
        media: Optional media dict with keys: link, title, description, picture, photo
        scheduled_at: Optional ISO 8601 timestamp for scheduling (e.g., "2026-01-23T14:30:00Z")
        now: If True, post immediately instead of adding to queue

    Returns:
        API response dict with success status and update details
    """
    data = {
        "access_token": access_token,
        "text": text,
        "profile_ids[]": profile_ids,
    }

    if media:
        for key, value in media.items():
            if value:
                data[f"media[{key}]"] = value

    if scheduled_at:
        data["scheduled_at"] = scheduled_at
    elif now:
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


def publish_to_buffer(
    access_token: str,
    service: str,
    text: str,
    media: Optional[Dict] = None,
    scheduled_at: Optional[str] = None,
    now: bool = False
) -> Dict:
    """High-level function to publish to a specific service via Buffer

    Args:
        access_token: Buffer API access token
        service: Service name ('twitter', 'linkedin')
        text: The post text content
        media: Optional media dict
        scheduled_at: Optional ISO 8601 timestamp
        now: If True, post immediately

    Returns:
        API response dict
    """
    profile = get_profile_by_service(access_token, service)

    if not profile:
        return {"success": False, "error": f"No {service} profile found"}

    profile_id = profile["id"]
    print(f"Publishing to {service} profile: {profile.get('service_username', profile_id)}")

    return create_buffer_update(
        access_token=access_token,
        profile_ids=[profile_id],
        text=text,
        media=media,
        scheduled_at=scheduled_at,
        now=now
    )


def format_linkedin_post(
    headline: str,
    body: str,
    hashtags: List[str],
    link: Optional[str] = None,
    cta: Optional[str] = None
) -> str:
    """Format a professional LinkedIn post

    LinkedIn best practices:
    - Hook in first line (visible before "see more")
    - Professional tone, industry insights
    - 1300-2000 chars optimal
    - 3-5 hashtags at end
    - Clear CTA
    """
    parts = []

    # Hook/headline first (this shows before "see more")
    parts.append(headline)
    parts.append("")  # Empty line

    # Body content
    parts.append(body)

    # CTA if provided
    if cta:
        parts.append("")
        parts.append(cta)

    # Link if provided
    if link:
        parts.append("")
        parts.append(link)

    # Hashtags at the end
    if hashtags:
        parts.append("")
        parts.append(" ".join(hashtags[:5]))  # LinkedIn: 3-5 hashtags

    return "\n".join(parts)


def format_twitter_post(
    main_text: str,
    hashtags: List[str],
    link: Optional[str] = None
) -> str:
    """Format a Twitter/X post

    Twitter best practices:
    - 280 char limit (links take ~23 chars)
    - Punchy, conversational tone
    - 1-2 hashtags max (integrated or at end)
    - Emojis encouraged for engagement
    - Can be meme-y/casual
    """
    parts = [main_text]

    # Add link if provided (Twitter auto-shortens)
    if link:
        parts.append(link)

    # Add 1-2 hashtags (Twitter prefers fewer)
    if hashtags:
        parts.append(" ".join(hashtags[:2]))

    text = "\n".join(parts)

    # Ensure under 280 chars
    if len(text) > 280:
        # Truncate main text to fit
        overflow = len(text) - 277  # Leave room for "..."
        main_text = main_text[:-overflow] + "..."
        parts[0] = main_text
        text = "\n".join(parts)

    return text


if __name__ == "__main__":
    # Quick test - list profiles
    token = get_env("BUFFER_ACCESS_TOKEN", required=False)
    if token:
        print("Fetching Buffer profiles...")
        profiles = get_buffer_profiles(token)
        for p in profiles:
            print(f"  - {p.get('service')}: {p.get('service_username')} (id: {p.get('id')})")
    else:
        print("Set BUFFER_ACCESS_TOKEN to test")
