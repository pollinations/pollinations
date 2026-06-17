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


# --- Post creation ---

def create_buffer_post(
    access_token: str,
    channel_id: str,
    text: str,
    media: Optional[Dict] = None,
    metadata: Optional[Dict] = None,
    scheduled_at: Optional[str] = None,
    now: bool = False,
) -> Dict:
    """Create a Buffer post for a single channel via GraphQL.

    Args:
        access_token: Buffer API access token
        channel_id: Buffer channel ID to post to
        text: The post text content
        media: Optional media dict with key 'photo' or 'url' containing image URL
        metadata: Optional per-platform metadata for Buffer GraphQL
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

    if metadata:
        post_input["metadata"] = metadata

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
