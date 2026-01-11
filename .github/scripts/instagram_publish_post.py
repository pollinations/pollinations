#!/usr/bin/env python3
"""
Instagram Post Publisher - Publishes posts to Instagram when PR is merged
Reads JSON from social/news/transformed/instagram/posts/ and posts via Graph API
"""

import os
import sys
import json
import time
import requests
from typing import Dict, List, Optional

# Constants
INSTAGRAM_GRAPH_API = "https://graph.facebook.com/v21.0"
GITHUB_API_BASE = "https://api.github.com"
MAX_RETRIES = 3
RETRY_DELAY = 5


def get_env(key: str, required: bool = True) -> str:
    """Get environment variable with optional requirement check"""
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def read_post_json(file_path: str) -> Optional[Dict]:
    """Read and parse the Instagram post JSON file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: Post file not found: {file_path}")
        return None
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}")
        return None


def create_media_container(
    ig_user_id: str,
    access_token: str,
    image_url: str,
    caption: str = None,
    is_carousel_item: bool = False
) -> Optional[str]:
    """Create a media container for an image"""

    url = f"{INSTAGRAM_GRAPH_API}/{ig_user_id}/media"

    params = {
        "image_url": image_url,
        "access_token": access_token
    }

    if is_carousel_item:
        params["is_carousel_item"] = "true"
    elif caption:
        params["caption"] = caption

    print(f"Creating media container for image...")

    for attempt in range(MAX_RETRIES):
        try:
            response = requests.post(url, data=params, timeout=60)
            result = response.json()

            if "id" in result:
                container_id = result["id"]
                print(f"  Created container: {container_id}")
                return container_id
            else:
                error = result.get("error", {})
                print(f"  Error: {error.get('message', 'Unknown error')}")

                # Check if it's a rate limit error
                if error.get("code") == 4:
                    print("  Rate limited, waiting 60 seconds...")
                    time.sleep(60)
                    continue

        except requests.exceptions.RequestException as e:
            print(f"  Request error: {e}")

        if attempt < MAX_RETRIES - 1:
            print(f"  Retrying in {RETRY_DELAY}s...")
            time.sleep(RETRY_DELAY)

    return None


def create_carousel_container(
    ig_user_id: str,
    access_token: str,
    children_ids: List[str],
    caption: str
) -> Optional[str]:
    """Create a carousel container with multiple images"""

    url = f"{INSTAGRAM_GRAPH_API}/{ig_user_id}/media"

    params = {
        "media_type": "CAROUSEL",
        "children": ",".join(children_ids),
        "caption": caption,
        "access_token": access_token
    }

    print(f"Creating carousel container with {len(children_ids)} items...")

    for attempt in range(MAX_RETRIES):
        try:
            response = requests.post(url, data=params, timeout=60)
            result = response.json()

            if "id" in result:
                container_id = result["id"]
                print(f"  Created carousel container: {container_id}")
                return container_id
            else:
                error = result.get("error", {})
                print(f"  Error: {error.get('message', 'Unknown error')}")

        except requests.exceptions.RequestException as e:
            print(f"  Request error: {e}")

        if attempt < MAX_RETRIES - 1:
            print(f"  Retrying in {RETRY_DELAY}s...")
            time.sleep(RETRY_DELAY)

    return None


def check_container_status(
    access_token: str,
    container_id: str
) -> str:
    """Check the status of a media container"""

    url = f"{INSTAGRAM_GRAPH_API}/{container_id}"
    params = {
        "fields": "status_code,status",
        "access_token": access_token
    }

    try:
        response = requests.get(url, params=params, timeout=30)
        result = response.json()
        return result.get("status_code", "UNKNOWN")
    except Exception:
        return "UNKNOWN"


def wait_for_container_ready(
    ig_user_id: str,
    access_token: str,
    container_id: str,
    max_wait: int = 120
) -> bool:
    """Wait for a media container to be ready for publishing"""

    print(f"Waiting for container {container_id} to be ready...")

    start_time = time.time()
    while time.time() - start_time < max_wait:
        status = check_container_status(access_token, container_id)

        if status == "FINISHED":
            print("  Container is ready!")
            return True
        elif status in ["ERROR", "EXPIRED"]:
            print(f"  Container failed with status: {status}")
            return False
        else:
            print(f"  Status: {status}, waiting...")
            time.sleep(5)

    print("  Timeout waiting for container")
    return False


def publish_media(
    ig_user_id: str,
    access_token: str,
    container_id: str
) -> Optional[str]:
    """Publish a media container"""

    url = f"{INSTAGRAM_GRAPH_API}/{ig_user_id}/media_publish"

    params = {
        "creation_id": container_id,
        "access_token": access_token
    }

    print(f"Publishing media...")

    for attempt in range(MAX_RETRIES):
        try:
            response = requests.post(url, data=params, timeout=60)
            result = response.json()

            if "id" in result:
                media_id = result["id"]
                print(f"  Published! Media ID: {media_id}")
                return media_id
            else:
                error = result.get("error", {})
                print(f"  Error: {error.get('message', 'Unknown error')}")

        except requests.exceptions.RequestException as e:
            print(f"  Request error: {e}")

        if attempt < MAX_RETRIES - 1:
            print(f"  Retrying in {RETRY_DELAY}s...")
            time.sleep(RETRY_DELAY)

    return None


def get_media_permalink(
    access_token: str,
    media_id: str
) -> Optional[str]:
    """Get the permalink for a published media"""

    url = f"{INSTAGRAM_GRAPH_API}/{media_id}"
    params = {
        "fields": "permalink",
        "access_token": access_token
    }

    try:
        response = requests.get(url, params=params, timeout=30)
        result = response.json()
        return result.get("permalink")
    except Exception:
        return None


def add_pr_comment(
    github_token: str,
    owner: str,
    repo: str,
    pr_number: str,
    comment: str
):
    """Add a comment to the PR"""

    if not pr_number:
        print("No PR number provided, skipping comment")
        return

    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/issues/{pr_number}/comments"

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    try:
        response = requests.post(
            url,
            headers=headers,
            json={"body": comment},
            timeout=30
        )

        if response.status_code in [200, 201]:
            print("Added comment to PR")
        else:
            print(f"Failed to add comment: {response.status_code}")

    except requests.exceptions.RequestException as e:
        print(f"Error adding comment: {e}")


def publish_single_image(
    ig_user_id: str,
    access_token: str,
    image_url: str,
    caption: str
) -> Optional[str]:
    """Publish a single image post"""

    # Create container
    container_id = create_media_container(
        ig_user_id,
        access_token,
        image_url,
        caption=caption,
        is_carousel_item=False
    )

    if not container_id:
        return None

    # Wait for processing
    if not wait_for_container_ready(ig_user_id, access_token, container_id):
        return None

    # Publish
    return publish_media(ig_user_id, access_token, container_id)


def publish_carousel(
    ig_user_id: str,
    access_token: str,
    image_urls: List[str],
    caption: str
) -> Optional[str]:
    """Publish a carousel post with multiple images"""

    # Create containers for each image
    children_ids = []
    for i, url in enumerate(image_urls):
        print(f"Processing image {i + 1}/{len(image_urls)}...")
        container_id = create_media_container(
            ig_user_id,
            access_token,
            url,
            is_carousel_item=True
        )

        if container_id:
            # Wait for each container to be ready
            if wait_for_container_ready(ig_user_id, access_token, container_id):
                children_ids.append(container_id)
            else:
                print(f"  Skipping image {i + 1} - container not ready")
        else:
            print(f"  Skipping image {i + 1} - failed to create container")

        # Small delay between uploads
        time.sleep(2)

    if len(children_ids) < 2:
        print("Need at least 2 images for a carousel")
        if len(children_ids) == 1:
            print("Falling back to single image post...")
            # Re-create as non-carousel item
            return publish_single_image(
                ig_user_id,
                access_token,
                image_urls[0],
                caption
            )
        return None

    # Create carousel container
    carousel_id = create_carousel_container(
        ig_user_id,
        access_token,
        children_ids,
        caption
    )

    if not carousel_id:
        return None

    # Wait for carousel to be ready
    if not wait_for_container_ready(ig_user_id, access_token, carousel_id):
        return None

    # Publish
    return publish_media(ig_user_id, access_token, carousel_id)


def main():
    # Get environment variables
    ig_user_id = get_env('INSTAGRAM_USER_ID')
    access_token = get_env('INSTAGRAM_ACCESS_TOKEN')
    github_token = get_env('GITHUB_TOKEN', required=False)
    repo_full_name = get_env('GITHUB_REPOSITORY', required=False)
    post_file_path = get_env('POST_FILE_PATH')
    pr_number = get_env('PR_NUMBER', required=False)

    # Parse repo info
    owner_name = None
    repo_name = None
    if repo_full_name and '/' in repo_full_name:
        owner_name, repo_name = repo_full_name.split('/')

    # Read post data
    print(f"\n=== Reading Post Data ===")
    print(f"File: {post_file_path}")
    post_data = read_post_json(post_file_path)

    if not post_data:
        print("Failed to read post data. Exiting.")
        sys.exit(1)

    # Extract post info
    images = post_data.get('images', [])
    caption = post_data.get('caption', '')
    hashtags = post_data.get('hashtags', [])

    if not images:
        print("No images in post data. Exiting.")
        sys.exit(1)

    # Build full caption with hashtags
    full_caption = caption
    if hashtags:
        full_caption += "\n\n" + " ".join(hashtags)

    # Truncate caption if too long (Instagram limit is 2200 chars)
    if len(full_caption) > 2200:
        full_caption = full_caption[:2197] + "..."

    print(f"\n=== Post Details ===")
    print(f"Type: {post_data.get('post_type', 'unknown')}")
    print(f"Images: {len(images)}")
    print(f"Caption length: {len(full_caption)} chars")

    # Get image URLs
    image_urls = [img.get('url') for img in images if img.get('url')]

    if not image_urls:
        print("No valid image URLs. Exiting.")
        sys.exit(1)

    # Publish based on post type
    print(f"\n=== Publishing to Instagram ===")

    if len(image_urls) == 1:
        media_id = publish_single_image(
            ig_user_id,
            access_token,
            image_urls[0],
            full_caption
        )
    else:
        media_id = publish_carousel(
            ig_user_id,
            access_token,
            image_urls,
            full_caption
        )

    if not media_id:
        print("\nFailed to publish post. Exiting.")
        sys.exit(1)

    # Get permalink
    permalink = get_media_permalink(access_token, media_id)

    print(f"\n=== Success! ===")
    print(f"Media ID: {media_id}")
    if permalink:
        print(f"Permalink: {permalink}")

    # Add comment to PR
    if github_token and owner_name and repo_name and pr_number:
        comment = f"""## Instagram Post Published!

**Media ID:** `{media_id}`
"""
        if permalink:
            comment += f"**View Post:** {permalink}\n"

        comment += f"""
**Date:** {post_data.get('date', 'Unknown')}
**Type:** {post_data.get('post_type', 'Unknown')}
**Images:** {len(image_urls)}
"""

        add_pr_comment(github_token, owner_name, repo_name, pr_number, comment)

    print("\n=== Done! ===")


if __name__ == "__main__":
    main()
