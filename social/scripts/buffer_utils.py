#!/usr/bin/env python3
"""
Buffer API Utilities - Shared utilities for posting to LinkedIn and Twitter via Buffer
Uses Buffer's GraphQL API: https://api.buffer.com
"""

import requests
from typing import Dict, List, Optional

from common import get_env


BUFFER_GRAPHQL_URL = "https://api.buffer.com"


# --- GraphQL queries and mutations ---

GET_ORGANIZATIONS_QUERY = """
query GetOrganizations {
  account {
    organizations {
      id
    }
  }
}
"""

GET_CHANNELS_QUERY = """
query GetChannels($input: ChannelsInput!) {
  channels(input: $input) {
    id
    service
    name
    displayName
    avatar
    isDisconnected
  }
}
"""

CREATE_POST_MUTATION = """
mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess {
      post {
        id
        status
        text
      }
    }
    ... on InvalidInputError { message }
    ... on UnauthorizedError { message }
    ... on LimitReachedError { message }
    ... on UnexpectedError { message }
  }
}
"""


# --- Core helpers ---

def _graphql_request(access_token: str, query: str, variables: Optional[Dict] = None) -> Dict:
    """Execute a GraphQL request against the Buffer API."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    payload: Dict = {"query": query}
    if variables:
        payload["variables"] = variables

    response = requests.post(
        BUFFER_GRAPHQL_URL,
        headers=headers,
        json=payload,
        timeout=60,
    )

    if response.status_code != 200:
        print(f"Buffer GraphQL HTTP error: {response.status_code} - {response.text[:500]}")
        return {"errors": [{"message": f"HTTP {response.status_code}"}]}

    result = response.json()
    if "errors" in result:
        print(f"Buffer GraphQL errors: {result['errors']}")
    return result


def get_organization_id(access_token: str) -> Optional[str]:
    """Fetch the first organization ID for the authenticated user."""
    result = _graphql_request(access_token, GET_ORGANIZATIONS_QUERY)
    try:
        orgs = result["data"]["account"]["organizations"]
        if orgs:
            return orgs[0]["id"]
    except (KeyError, TypeError, IndexError):
        pass
    print("No organization found in Buffer account")
    return None


# --- Channel (profile) functions ---

def get_buffer_channels(access_token: str) -> List[Dict]:
    """Fetch all Buffer channels for the authenticated user.

    Returns list of channels with id, service, name, displayName, etc.
    """
    org_id = get_organization_id(access_token)
    if not org_id:
        return []

    result = _graphql_request(
        access_token,
        GET_CHANNELS_QUERY,
        variables={"input": {"organizationId": org_id}},
    )

    try:
        channels = result["data"]["channels"]
        return [ch for ch in channels if not ch.get("isDisconnected")]
    except (KeyError, TypeError):
        return []


# Backward-compatible alias
get_buffer_profiles = get_buffer_channels


def get_channel_by_service(access_token: str, service: str) -> Optional[Dict]:
    """Get a specific channel by service name (twitter, linkedin, etc.)

    Args:
        access_token: Buffer API access token
        service: Service name ('twitter', 'linkedin', 'instagram', etc.)

    Returns:
        Channel dict or None if not found
    """
    channels = get_buffer_channels(access_token)

    for channel in channels:
        if channel.get("service") == service:
            return channel

    print(f"No {service} channel found in Buffer account")
    return None


# Backward-compatible alias
get_profile_by_service = get_channel_by_service


# --- Post creation ---

def create_buffer_post(
    access_token: str,
    channel_id: str,
    text: str,
    media: Optional[Dict] = None,
    scheduled_at: Optional[str] = None,
    now: bool = False,
) -> Dict:
    """Create a Buffer post for a single channel via GraphQL.

    Args:
        access_token: Buffer API access token
        channel_id: Buffer channel ID to post to
        text: The post text content
        media: Optional media dict with key 'photo' or 'url' containing image URL
        scheduled_at: Optional ISO 8601 timestamp for scheduling
        now: If True, post immediately (shareNow mode)

    Returns:
        Dict with success status. On success: {"success": True, "post": {...}}.
        On failure: {"success": False, "error": "..."}.
    """
    if scheduled_at:
        mode = "customScheduled"
    elif now:
        mode = "shareNow"
    else:
        mode = "addToQueue"

    post_input: Dict = {
        "channelId": channel_id,
        "text": text,
        "schedulingType": "automatic",
        "mode": mode,
    }

    if scheduled_at:
        post_input["dueAt"] = scheduled_at

    # Map media (REST used media[photo], GraphQL uses assets.images)
    if media:
        photos = media.get("photos")  # list of URLs (for carousel)
        if photos:
            post_input["assets"] = {
                "images": [{"url": u} for u in photos]
            }
        else:
            image_url = media.get("photo") or media.get("url")
            if image_url:
                post_input["assets"] = {
                    "images": [{"url": image_url}]
                }

    result = _graphql_request(
        access_token,
        CREATE_POST_MUTATION,
        variables={"input": post_input},
    )

    try:
        create_result = result["data"]["createPost"]
        if "post" in create_result:
            return {"success": True, "post": create_result["post"]}
        error_msg = create_result.get("message", "Unknown error from Buffer API")
        print(f"Buffer createPost error: {error_msg}")
        return {"success": False, "error": error_msg}
    except (KeyError, TypeError) as e:
        errors = result.get("errors", [{"message": str(e)}])
        error_msg = errors[0].get("message", str(e)) if errors else str(e)
        return {"success": False, "error": error_msg}


def create_buffer_update(
    access_token: str,
    profile_ids: List[str],
    text: str,
    media: Optional[Dict] = None,
    scheduled_at: Optional[str] = None,
    now: bool = False,
) -> Dict:
    """Backward-compatible wrapper. Posts to the first profile_id only."""
    if not profile_ids:
        return {"success": False, "error": "No profile IDs provided"}
    return create_buffer_post(
        access_token=access_token,
        channel_id=profile_ids[0],
        text=text,
        media=media,
        scheduled_at=scheduled_at,
        now=now,
    )


# --- High-level publish ---

def publish_to_buffer(
    access_token: str,
    service: str,
    text: str,
    media: Optional[Dict] = None,
    scheduled_at: Optional[str] = None,
    now: bool = False,
) -> Dict:
    """High-level function to publish to a specific service via Buffer.

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
    channel = get_channel_by_service(access_token, service)

    if not channel:
        return {"success": False, "error": f"No {service} channel found"}

    channel_id = channel["id"]
    print(f"Publishing to {service} channel: {channel.get('displayName', channel_id)}")

    return create_buffer_post(
        access_token=access_token,
        channel_id=channel_id,
        text=text,
        media=media,
        scheduled_at=scheduled_at,
        now=now,
    )


# --- Text formatting helpers (unchanged) ---

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
    # Quick test - list channels
    token = get_env("BUFFER_ACCESS_TOKEN", required=False)
    if token:
        print("Fetching Buffer channels...")
        channels = get_buffer_channels(token)
        for ch in channels:
            print(f"  - {ch.get('service')}: {ch.get('displayName')} (id: {ch.get('id')})")
    else:
        print("Set BUFFER_ACCESS_TOKEN to test")
