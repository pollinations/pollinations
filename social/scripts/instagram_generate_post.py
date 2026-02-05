#!/usr/bin/env python3
"""
Instagram Post Generator - Daily workflow to create AI-generated Instagram posts
Fetches PRs from pollinations/pollinations, researches trends, generates images
"""

import sys
import json
import time
import base64
import requests
from typing import Dict, List
from datetime import datetime, timezone
from common import (
    load_prompt,
    get_env,
    get_date_range,
    get_file_sha,
    call_pollinations_api,
    generate_image,
    GITHUB_API_BASE,
    GITHUB_GRAPHQL_API,
)

# Instagram post settings
IMAGE_WIDTH = 2048
IMAGE_HEIGHT = 2048  # 1:1 aspect ratio for Instagram

# Platform name for prompt loading
PLATFORM = "instagram"


def get_merged_prs(owner: str, repo: str, start_date: datetime, token: str) -> List[Dict]:
    """Fetch merged PRs using GraphQL for the last 24 hours"""

    query = """
    query($owner: String!, $repo: String!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        pullRequests(
          states: MERGED
          first: 100
          after: $cursor
          orderBy: {field: UPDATED_AT, direction: DESC}
          baseRefName: "main"
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            number
            title
            body
            url
            mergedAt
            updatedAt
            author {
              login
            }
            labels(first: 10) {
              nodes {
                name
              }
            }
          }
        }
      }
    }
    """

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    all_prs = []
    cursor = None
    page = 1

    print(f"Fetching merged PRs since {start_date.strftime('%Y-%m-%d %H:%M')} UTC...")

    while True:
        variables = {
            "owner": owner,
            "repo": repo,
            "cursor": cursor
        }

        response = requests.post(
            GITHUB_GRAPHQL_API,
            headers=headers,
            json={"query": query, "variables": variables},
            timeout=60
        )

        if response.status_code != 200:
            print(f"GraphQL error: {response.status_code} -> {response.text[:500]}")
            return []

        data = response.json()

        if "errors" in data:
            print(f"GraphQL query errors: {data['errors']}")
            return []

        pr_data = data["data"]["repository"]["pullRequests"]
        nodes = pr_data["nodes"]
        page_info = pr_data["pageInfo"]

        print(f"  Page {page}: fetched {len(nodes)} PRs")

        oldest_update_on_page = None

        for pr in nodes:
            merged_at = datetime.fromisoformat(pr["mergedAt"].replace("Z", "+00:00"))
            updated_at = datetime.fromisoformat(pr["updatedAt"].replace("Z", "+00:00"))

            if oldest_update_on_page is None or updated_at < oldest_update_on_page:
                oldest_update_on_page = updated_at

            # Only include PRs merged within our date range
            if merged_at >= start_date:
                labels = [label["name"] for label in pr["labels"]["nodes"]]
                all_prs.append({
                    "number": pr["number"],
                    "title": pr["title"],
                    "body": pr["body"] or "",
                    "author": pr["author"]["login"] if pr.get("author") and pr["author"].get("login") else "ghost",
                    "merged_at": pr["mergedAt"],
                    "html_url": pr["url"],
                    "labels": labels
                })

        if oldest_update_on_page and oldest_update_on_page < start_date:
            print(f"  Reached PRs last updated before {start_date.strftime('%Y-%m-%d')}, stopping")
            break

        if not page_info["hasNextPage"]:
            break

        cursor = page_info["endCursor"]
        page += 1

    return all_prs


def get_instagram_trends() -> Dict:
    """Return static Instagram trends data (researched Dec 2025)
    
    Based on research from Vista Social, Sprout Social, TechTimes, and EarlyGame.
    
    KEY AESTHETIC DIRECTION: Retro 8-bit pixel art but BEAUTIFUL
    - Modern interpretation of nostalgic gaming visuals
    - Clean, cozy pixel art with pastel palettes (like Unpacking, A Short Hike)
    - Lo-fi aesthetic with soft lighting and warm colors
    - Chunky pixels but emotionally resonant
    - Think: Studio Ghibli meets retro gaming
    
    Why pixel art works in 2025:
    - Retro game boom: $3.8B market, double-digit growth
    - Gen Z discovering retro through TikTok (#retrogaming billions of views)
    - Nostalgia for 80s/90s aesthetics crosses generations
    - Pixel art = accessible, charming, instantly recognizable
    """
    return {
        "trending_styles": [
            "retro 8-bit pixel art with modern soft lighting",
            "cozy pixel aesthetic (like Unpacking, A Short Hike)",
            "lo-fi chunky pixels with pastel color palettes",
            "lime green (#ecf874) as accent color",
            "soft gradients behind pixel sprites",
            "CRT monitor / retro screen glow effects",
            "clean minimalist pixel illustrations",
            "warm, emotionally resonant pixel scenes"
        ],
        "popular_formats": [
            "carousel (3-5 images) - highest engagement",
            "pixel art animation loops (GIF-style)",
            "retro game screenshot aesthetic",
            "infographic with pixel icons",
            "before/after or evolution sequences"
        ],
        "ai_art_trends": [
            "pixel art characters (bees 🐝, flowers 🌸, cute robots)",
            "retro game UI elements",
            "cozy pixel scenes (gardens, workspaces, nature)",
            "nostalgic gaming references",
            "8-bit but beautiful - modern lighting on retro sprites"
        ],
        "engagement_hooks": [
            "question in caption",
            "swipe for more →",
            "tag someone who needs this",
            "save for later 📌",
            "which one are you?",
            "nostalgia check ✓"
        ],
        "meme_formats": [
            "relatable developer struggles (pixel art style)",
            "AI expectations vs reality",
            "wholesome tech community moments",
            "retro game references for coding life"
        ],
        "hashtag_suggestions": [
            "#aiart", "#generativeai", "#pollinations", "#opensource",
            "#pixelart", "#retrogaming", "#8bit", "#indiedev",
            "#creativecoding", "#buildinpublic", "#cozyvibes"
        ],
        "visual_donts": [
            "dark/dramatic/cyberpunk imagery",
            "corporate stock photo vibes",
            "intimidating or edgy tones",
            "cold industrial aesthetics",
            "hyper-realistic 3D renders"
        ],
        "pixel_art_references": [
            "Unpacking (2021) - clean, cozy, pastel palette, warm hug vibes",
            "A Short Hike (2019) - chunky low-res, wholesome, serene",
            "Stardew Valley - friendly, nature-focused, community",
            "Balatro (2024) - punchy lo-fi aesthetic, vibrant animations",
            "Animal Well (2024) - moody yet whimsical, soft lighting"
        ]
    }


def generate_post_strategy(prs: List[Dict], token: str) -> Dict:
    """AI decides the content strategy and generates image prompts
    
    Prompts are loaded from social/prompts/instagram/
    (Trends data is now included in the system.md prompt file)
    """

    # Format PRs for context
    pr_summary = ""
    update_count = len(prs)
    if prs:
        pr_summary = f"TODAY'S UPDATES ({update_count} merged PRs):\n"
        for pr in prs[:15]:  # Limit to 15 most recent
            labels_str = f" [{', '.join(pr['labels'])}]" if pr['labels'] else ""
            pr_summary += f"- #{pr['number']}: {pr['title']}{labels_str}\n"
            if pr['body']:
                pr_summary += f"  Description: {pr['body'][:200]}...\n"
    else:
        pr_summary = "NO UPDATES TODAY"

    # Load system prompt from external file and inject PR summary
    system_prompt_template = load_prompt(PLATFORM, "system")
    system_prompt = system_prompt_template.replace("{pr_summary}", pr_summary)

    # Load user prompt based on whether we have PRs
    if prs:
        user_prompt_template = load_prompt(PLATFORM, "user_with_prs")
        pr_titles = [pr['title'] for pr in prs[:5]]
        user_prompt = user_prompt_template.replace("{pr_titles}", str(pr_titles))
    else:
        user_prompt = load_prompt(PLATFORM, "user_brand_content")

    print("Generating post strategy...")
    response = call_pollinations_api(system_prompt, user_prompt, token, temperature=0.7, verbose=True)

    if not response:
        print("Strategy generation failed")
        return None

    try:
        response = response.strip()
        if response.startswith("```"):
            lines = response.split("\n")
            lines = [l for l in lines if not l.startswith("```")]
            response = "\n".join(lines)

        strategy = json.loads(response)
        print(f"Strategy: {strategy['content_type']} - {strategy.get('strategy_reasoning', 'N/A')}")
        print(f"Image count: {strategy['image_count']}")
        return strategy

    except json.JSONDecodeError as e:
        print(f"Failed to parse strategy: {e}")
        print(f"Response was: {response[:500]}")
        return None


def create_post_pr(strategy: Dict, images: List[bytes], image_urls: List[str], prs: List[Dict], github_token: str, owner: str, repo: str):
    """Create a PR with the Instagram post JSON and images"""

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    # Get base branch SHA
    ref_response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/ref/heads/main",
        headers=headers
    )
    if ref_response.status_code != 200:
        print(f"Error getting ref: {ref_response.text}")
        return

    base_sha = ref_response.json()['object']['sha']

    # Create new branch
    branch_name = f"instagram-post-{today}"
    create_branch_response = requests.post(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/refs",
        headers=headers,
        json={
            "ref": f"refs/heads/{branch_name}",
            "sha": base_sha
        }
    )

    if create_branch_response.status_code not in [200, 201]:
        if "Reference already exists" not in create_branch_response.text:
            print(f"Error creating branch: {create_branch_response.text}")
            return
        print(f"Branch {branch_name} already exists, updating...")

    print(f"Created branch: {branch_name}")

    # Prepare image data using the actual generated URLs (without key)
    image_data = []
    for i, img_info in enumerate(strategy.get('images', [])):
        if i < len(images) and images[i] and i < len(image_urls) and image_urls[i]:
            image_data.append({
                "url": image_urls[i],
                "prompt": img_info.get('prompt', ''),
                "description": img_info.get('description', '')
            })

    # Create the JSON post data
    post_data = {
        "date": today,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "post_type": "carousel" if len(image_data) > 1 else "single",
        "content_type": strategy.get('content_type', 'casual'),
        "linked_images": strategy.get('linked_images', True),
        "strategy_reasoning": strategy.get('strategy_reasoning', ''),
        "story_arc": strategy.get('story_arc', ''),
        "images": image_data,
        "caption": strategy.get('caption', ''),
        "hashtags": strategy.get('hashtags', []),
        "alt_text": strategy.get('alt_text', ''),
        "pr_references": [f"#{pr['number']}" for pr in prs] if prs else []
    }

    # Create directories and JSON file
    json_path = f"social/news/transformed/instagram/posts/{today}.json"
    json_content = json.dumps(post_data, indent=2, ensure_ascii=False)
    json_encoded = base64.b64encode(json_content.encode()).decode()

    # Check if file exists
    json_sha = get_file_sha(github_token, owner, repo, json_path, branch_name)
    if not json_sha:
        json_sha = get_file_sha(github_token, owner, repo, json_path, "main")

    json_payload = {
        "message": f"instagram: add post for {today}",
        "content": json_encoded,
        "branch": branch_name
    }
    if json_sha:
        json_payload["sha"] = json_sha

    json_response = requests.put(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{json_path}",
        headers=headers,
        json=json_payload
    )

    if json_response.status_code not in [200, 201]:
        print(f"Error creating JSON file: {json_response.text}")
        return

    print(f"Created {json_path}")

    # Create PR
    pr_title = f"Instagram Post - {today}"

    # Build image preview for PR body
    image_preview = ""
    for i, img in enumerate(image_data):
        image_preview += f"\n### Image {i + 1}\n"
        image_preview += f"**Prompt:** {img['prompt'][:100]}...\n"
        image_preview += f"**Description:** {img['description']}\n"
        image_preview += f"![Preview]({img['url']})\n"

    hashtags_str = " ".join(post_data['hashtags'])

    story_arc = post_data.get('story_arc', '')
    linked_images = post_data.get('linked_images', True)
    image_mode = "LINKED (I2I chained for visual continuity)" if linked_images else "STANDALONE (each generated independently)"

    pr_body = f"""## Instagram Post for {today}

**Content Type:** {post_data['content_type']}
**Strategy:** {post_data['strategy_reasoning']}
**Story Arc:** {story_arc}
**Images:** {len(image_data)} - {image_mode}

### Caption
{post_data['caption']}

### Hashtags
{hashtags_str}

### Alt Text
{post_data['alt_text']}

{image_preview}

---
**PR References:** {', '.join(post_data['pr_references']) if post_data['pr_references'] else 'None (brand content)'}

"""
    if linked_images:
        pr_body += "**Note:** Images are generated using I2I (image-to-image) chaining - each image uses the previous as reference for visual storytelling continuity.\n\n"
    else:
        pr_body += "**Note:** Images are generated independently (standalone mode) - each image is a fresh generation.\n\n"

    pr_body += """When this PR is merged, the post will be automatically published to Instagram.

Generated automatically by GitHub Actions
"""

    pr_response = requests.post(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls",
        headers=headers,
        json={
            "title": pr_title,
            "body": pr_body,
            "head": branch_name,
            "base": "main"
        }
    )

    if pr_response.status_code not in [200, 201]:
        if "A pull request already exists" in pr_response.text:
            # Find and update the existing PR
            list_response = requests.get(
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls?head={owner}:{branch_name}&state=open",
                headers=headers
            )
            if list_response.status_code == 200 and list_response.json():
                existing_pr = list_response.json()[0]
                update_response = requests.patch(
                    f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls/{existing_pr['number']}",
                    headers=headers,
                    json={"title": pr_title, "body": pr_body}
                )
                if update_response.status_code == 200:
                    print(f"Updated existing PR #{existing_pr['number']}: {existing_pr['html_url']}")
                    return
            print("PR already exists but could not update it")
            return
        print(f"Error creating PR: {pr_response.text}")
        return

    pr_data = pr_response.json()
    print(f"Created PR #{pr_data['number']}: {pr_data['html_url']}")

    # Add labels from PR_LABELS env var
    pr_labels = get_env('PR_LABELS', required=False)
    if pr_labels:
        labels_list = [label.strip() for label in pr_labels.split(',')]
        label_response = requests.post(
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/issues/{pr_data['number']}/labels",
            headers=headers,
            json={"labels": labels_list}
        )
        if label_response.status_code in [200, 201]:
            print(f"Added labels {labels_list}")
        else:
            print(f"Warning: Could not add labels: {label_response.status_code}")


def main():
    # Get environment variables
    github_token = get_env('GITHUB_TOKEN')
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    repo_full_name = get_env('GITHUB_REPOSITORY')
    source_repo = get_env('SOURCE_REPO', required=False) or "pollinations/pollinations"
    days_back = int(get_env('DAYS_BACK', required=False) or "1")
    force_brand_content = get_env('FORCE_BRAND_CONTENT', required=False) == "true"

    owner_name, repo_name = repo_full_name.split('/')
    source_owner, source_repo_name = source_repo.split('/')

    # Step 1: Fetch merged PRs from source repo (unless forcing brand content)
    merged_prs = []
    if force_brand_content:
        print(f"\n=== Forcing Brand Content (skipping PR fetch) ===")
    else:
        start_date, end_date = get_date_range(days_back)
        print(f"\n=== Fetching PRs from {source_repo} (last {days_back} day(s)) ===")
        merged_prs = get_merged_prs(source_owner, source_repo_name, start_date, github_token)
        print(f"Found {len(merged_prs)} merged PRs")

    # Step 2: Generate post strategy (trends now embedded in prompt files)
    print(f"\n=== Generating Post Strategy ===")
    strategy = generate_post_strategy(merged_prs, pollinations_token)

    if not strategy:
        print("Failed to generate strategy. Exiting.")
        sys.exit(1)

    # Clamp image count to 3-5
    img_list = strategy.get('images', [])
    if len(img_list) < 3:
        print(f"Warning: AI generated {len(img_list)} images, need at least 3")
    if len(img_list) > 5:
        print(f"Clamping images from {len(img_list)} to 5")
        strategy['images'] = img_list[:5]

    # Step 4: Generate images
    print(f"\n=== Generating Images ===")

    images = []
    image_urls = []

    for i, img_info in enumerate(strategy.get('images', [])):
        prompt = img_info.get('prompt', '')
        if not prompt:
            continue

        image_bytes, public_url = generate_image(
            prompt, pollinations_token, IMAGE_WIDTH, IMAGE_HEIGHT, i
        )

        if image_bytes:
            images.append(image_bytes)
            image_urls.append(public_url)
        else:
            images.append(None)
            image_urls.append(None)

        time.sleep(3)  # Rate limiting between images

    successful_images = sum(1 for img in images if img is not None)
    total_images = len(strategy.get('images', []))
    print(f"Generated {successful_images}/{total_images} images")

    if successful_images < total_images:
        print(f"Not all images generated successfully ({successful_images}/{total_images}). Exiting without creating PR.")
        sys.exit(1)

    # Step 5: Create PR
    print(f"\n=== Creating PR ===")
    create_post_pr(strategy, images, image_urls, merged_prs, github_token, owner_name, repo_name)

    print("\n=== Done! ===")


if __name__ == "__main__":
    main()
