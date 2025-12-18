#!/usr/bin/env python3
"""
Instagram Post Generator - Daily workflow to create AI-generated Instagram posts
Fetches PRs from pollinations/pollinations, researches trends, generates images
"""

import os
import sys
import json
import time
import random
import base64
import requests
from typing import Dict, List, Optional
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

# Constants
GITHUB_API_BASE = "https://api.github.com"
GITHUB_GRAPHQL_API = "https://api.github.com/graphql"
POLLINATIONS_API_BASE = "https://gen.pollinations.ai/v1/chat/completions"
POLLINATIONS_IMAGE_BASE = "https://gen.pollinations.ai/image"
MODEL = "gemini-large"
WEBSEARCH_MODEL = "perplexity-reasoning"
IMAGE_MODEL = "nanobanana-pro"
MAX_SEED = 2147483647  # Max int32
MAX_RETRIES = 3
INITIAL_RETRY_DELAY = 2  # Base delay for exponential backoff (2, 4, 8 seconds)

# Instagram post settings
IMAGE_WIDTH = 2048
IMAGE_HEIGHT = 2048  # 1:1 aspect ratio for Instagram


def get_env(key: str, required: bool = True) -> str:
    """Get environment variable with optional requirement check"""
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def get_date_range(days_back: int = 1) -> tuple[datetime, datetime]:
    """Get date range for the specified number of days back"""
    now = datetime.now(timezone.utc)
    end_date = now  # Current time
    start_date = end_date - timedelta(days=days_back)
    return start_date, end_date


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


def call_pollinations_api(system_prompt: str, user_prompt: str, token: str, temperature: float = 0.7, model: str = None) -> str:
    """Call Pollinations AI API with retry logic and exponential backoff

    Args:
        model: Model to use (defaults to MODEL constant if not specified)

    Each attempt uses a new random seed (0 to MAX_SEED/int32).
    Retries use exponential backoff: 2s, 4s, 8s...
    """
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    use_model = model or MODEL
    last_error = None

    for attempt in range(MAX_RETRIES):
        # Each attempt gets a fresh random seed
        seed = random.randint(0, MAX_SEED)

        payload = {
            "model": use_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature,
            "seed": seed
        }

        if attempt == 0:
            print(f"  Using seed: {seed}")
        else:
            # Exponential backoff: 2^attempt * initial_delay
            backoff_delay = INITIAL_RETRY_DELAY * (2 ** attempt)
            print(f"  Retry {attempt}/{MAX_RETRIES - 1} with new seed: {seed} (waiting {backoff_delay}s)")
            time.sleep(backoff_delay)

        try:
            response = requests.post(
                POLLINATIONS_API_BASE,
                headers=headers,
                json=payload,
                timeout=120
            )

            if response.status_code == 200:
                try:
                    result = response.json()
                    return result['choices'][0]['message']['content']
                except (KeyError, IndexError, json.JSONDecodeError) as e:
                    last_error = f"Error parsing API response: {e}"
                    print(f"  {last_error}")
            else:
                last_error = f"API error: {response.status_code}"
                print(f"  {last_error}: {response.text[:500]}")

        except requests.exceptions.RequestException as e:
            last_error = f"Request failed: {e}"
            print(f"  {last_error}")

    print(f"All {MAX_RETRIES} attempts failed. Last error: {last_error}")
    return None


def research_trending_content(token: str) -> Dict:
    """Research current Instagram trends using AI with web capabilities"""

    system_prompt = """You are a social media trend researcher for Pollinations.AI, an open-source AI platform.
Your task is to research current Instagram trends that would work well for an AI/tech creative tools brand.

Research and output a JSON object with:
1. trending_styles: Current visual aesthetics trending on Instagram (colors, compositions, styles)
2. popular_formats: What types of posts are performing well (carousels, single images, memes, etc.)
3. ai_art_trends: What's trending in AI art community
4. engagement_hooks: Caption styles, hooks, and CTAs that work
5. meme_formats: Current popular meme templates or humor styles in tech/AI space
6. hashtag_suggestions: Relevant trending hashtags

Focus on: AI art, generative AI, creative tools, developer community, tech innovation.

Output ONLY valid JSON, no markdown code blocks."""

    user_prompt = """Research current Instagram trends for December 2025 that would work for Pollinations.AI -
an open-source AI image/video generation platform. What visual styles, formats, and content types
are performing well right now? What would make people stop scrolling?"""

    print(f"Researching Instagram trends using {WEBSEARCH_MODEL}...")
    response = call_pollinations_api(system_prompt, user_prompt, token, temperature=0.8, model=WEBSEARCH_MODEL)

    if not response:
        print("Trend research failed, using defaults")
        return {
            "trending_styles": ["vibrant gradients", "minimalist tech", "neon aesthetics"],
            "popular_formats": ["carousel", "single striking image"],
            "ai_art_trends": ["surrealism", "photorealistic", "abstract"],
            "engagement_hooks": ["question in caption", "call to action"],
            "meme_formats": ["tech humor", "AI jokes"],
            "hashtag_suggestions": ["#aiart", "#generativeai", "#pollinations", "#opensource"]
        }

    try:
        # Clean up response if it has markdown
        response = response.strip()
        if response.startswith("```"):
            lines = response.split("\n")
            lines = [l for l in lines if not l.startswith("```")]
            response = "\n".join(lines)

        return json.loads(response)
    except json.JSONDecodeError as e:
        print(f"Failed to parse trend research: {e}")
        return {
            "trending_styles": ["vibrant", "tech aesthetic"],
            "popular_formats": ["carousel"],
            "ai_art_trends": ["creative AI"],
            "engagement_hooks": ["engagement"],
            "meme_formats": ["tech humor"],
            "hashtag_suggestions": ["#aiart", "#pollinations"]
        }


def generate_post_strategy(prs: List[Dict], trends: Dict, token: str) -> Dict:
    """AI decides the content strategy and generates image prompts"""

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

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

    system_prompt = f"""You are the Gen-Z social media lead for Pollinations.AI Instagram.
Pollinations.AI is a free, open-source AI image generation platform - no login, no BS, just free AI art.

YOUR MISSION: Create friendly, approachable, Gen-Z aesthetic content that reflects our brand. Turn updates into visually appealing infographics and friendly illustrations.

{pr_summary}

=== POLLINATIONS BRAND IDENTITY ===
Our name "Pollinations" = 🌸 flowers, 🐝 bees, nature, growth, organic
- We are "Your Friendly Open-Source Gen-AI Platform"
- Approachable, not intimidating
- Community-focused, welcoming
- Open source = transparent, collaborative

=== VISUAL STYLE (CRITICAL - follow this!) ===
Colors:
- PRIMARY: Lime green (#ecf874) 🌿 - use this a lot!
- SECONDARY: Soft pastels (mint, lavender, peach)
- ACCENT: Dark purple (#110518) for text/contrast
- Background: Soft gradients, not harsh

Style:
- FRIENDLY INFOGRAPHICS with simple icons and minimal text
- Cute illustrated characters (friendly bees 🐝, flowers 🌸, happy robots)
- ROUNDED shapes and soft shadows
- Hand-drawn/doodle elements mixed with clean design
- Minimalist but playful - NOT corporate, NOT dark, NOT edgy
- Gen-Z aesthetic: bold colors, authentic, community vibes

AVOID:
- Dark/dramatic classical art styles
- Cold industrial/cyberpunk aesthetics
- Intimidating or edgy imagery
- Corporate stock photo vibes
- Heavy/serious tones

=== IMAGE GENERATION (nanobanana-pro) ===
Our model is Gemini 3 Pro Image (nanobanana-pro):
- CONTEXTUAL UNDERSTANDING - It gets nuance
- TEXT IN IMAGES - Use simple text overlays sparingly
- High quality 4K output
- Describe the STYLE explicitly: "soft gradients, rounded shapes, Gen-Z aesthetic, friendly illustration"

=== CONTENT IDEAS (on-brand) ===
- Friendly infographic explaining the update with cute icons
- Illustrated bee/flower character reacting to the news
- Soft gradient background with minimal text and emojis
- "Nature is healing" themed growth/bloom metaphors
- Cozy developer vibes (plants, coffee, calm workspace)
- Celebratory confetti/sparkle aesthetic for wins
- Simple before/after comparisons with friendly icons

=== OUTPUT FORMAT (JSON only) ===
{{
    "content_type": "infographic|illustration|wholesome",
    "linked_images": true/false,
    "strategy_reasoning": "Why this visual approach works for our brand",
    "visual_style": "Description of the visual style you're going for",
    "image_count": 1-4,
    "images": [
        {{
            "prompt": "Detailed prompt - MUST include: 'soft lime green and pastel gradients, rounded shapes, friendly illustration style, Gen-Z aesthetic, minimalist'. Add specific scene description.",
            "description": "What this image communicates",
            "text_in_image": "Short text if any (keep minimal, use emojis)"
        }}
    ],
    "caption": "Friendly, casual Gen-Z tone. Use emojis naturally ✨🌱. Include soft CTA like 'link in bio'",
    "hashtags": ["#pollinations", "#aiart", "#opensource", "#generativeai", "#aiartcommunity", "#freeart"],
    "alt_text": "Accessibility description (describe colors, characters, layout)"
}}

=== PROMPT TEMPLATE (use this structure) ===
"[Scene description]. Soft lime green (#ecf874) and pastel gradient background. [Character/icon description] with rounded shapes and soft shadows. Friendly illustration style, minimalist, Gen-Z aesthetic. [Any text overlay]. Clean vector art, approachable and welcoming."

=== RULES ===
- Friendly > edgy
- Approachable > intimidating  
- Celebrate community > brag about tech
- Nature/growth metaphors fit our brand
- Always include style keywords: "soft gradients, rounded shapes, friendly, Gen-Z aesthetic"

=== CURRENT INSTAGRAM TRENDS (use these for inspiration) ===
{json.dumps(trends, indent=2) if trends else "No trend data available"}"""

    if prs:
        user_prompt = f"""Create a friendly, on-brand visual post about these updates: {[pr['title'] for pr in prs[:5]]}

Remember: Use our visual style (lime green, soft pastels, friendly illustrations, Gen-Z aesthetic).
Output valid JSON only."""
    else:
        user_prompt = """No code updates today - create brand content!

Pick ONE of these on-brand themes:
- Celebrate our community (500+ apps built with Pollinations)
- Open source appreciation (free AI art for everyone 🌸)
- Creative inspiration (what you can make with AI)
- Behind the scenes (cozy dev vibes, plants & coffee)
- Nature/growth metaphors (seeds blooming, bees pollinating ideas)
- Welcome new creators to the platform

Remember: Friendly infographic style, lime green & pastels, cute illustrations.
Output valid JSON only."""

    print("Generating post strategy...")
    response = call_pollinations_api(system_prompt, user_prompt, token, temperature=0.7)

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


def generate_image(prompt: str, token: str, index: int, reference_url: str = None) -> tuple[Optional[bytes], Optional[str]]:
    """Generate a single image using Pollinations nanobanana-pro

    Args:
        prompt: The image generation prompt
        token: Pollinations API token
        index: Image index for logging
        reference_url: Optional URL of previous image for I2I continuity

    Returns:
        Tuple of (image_bytes, public_url) - public_url can be used for I2I reference (no key)

    Each attempt uses a new random seed (0 to MAX_SEED/int32).
    Retries use exponential backoff: 2s, 4s, 8s...
    """

    encoded_prompt = quote(prompt)
    base_url = f"{POLLINATIONS_IMAGE_BASE}/{encoded_prompt}"  # GET https://gen.pollinations.ai/image/{prompt}

    # Add reference image for image-to-image generation (creates visual continuity)
    if reference_url:
        print(f"Generating image {index + 1} (I2I from previous): {prompt[:50]}...")
    else:
        print(f"Generating image {index + 1} (T2I): {prompt[:50]}...")

    last_error = None

    for attempt in range(MAX_RETRIES):
        # Each attempt gets a fresh random seed
        seed = random.randint(0, MAX_SEED)

        # Params with key (for authenticated request)
        params = {
            "model": IMAGE_MODEL,
            "width": IMAGE_WIDTH,
            "height": IMAGE_HEIGHT,
            "quality": "hd",
            "nologo": "true",
            "private": "true",
            "nofeed": "true",
            "seed": seed,
            "key": token
        }

        # Add reference image for I2I (must be URL-encoded, but avoid double-encoding)
        if reference_url:
            # Check if already encoded (contains %) to avoid double-encoding
            if '%' in reference_url:
                params["image"] = reference_url
            else:
                params["image"] = quote(reference_url, safe='')

        if attempt == 0:
            print(f"  Using seed: {seed}")
        else:
            # Exponential backoff: 2^attempt * initial_delay
            backoff_delay = INITIAL_RETRY_DELAY * (2 ** attempt)
            print(f"  Retry {attempt}/{MAX_RETRIES - 1} with new seed: {seed} (waiting {backoff_delay}s)")
            time.sleep(backoff_delay)

        try:
            response = requests.get(base_url, params=params, timeout=300)

            if response.status_code == 200:
                content_type = response.headers.get('content-type', '')
                if 'image' in content_type:
                    print(f"  Image {index + 1} generated successfully")

                    # Build public URL without key for I2I reference
                    public_params = {k: v for k, v in params.items() if k != "key"}
                    public_url = base_url + "?" + "&".join(f"{k}={v}" for k, v in public_params.items())

                    return response.content, public_url
                else:
                    last_error = f"Unexpected content type: {content_type}"
                    print(f"  {last_error}")
            else:
                last_error = f"HTTP error: {response.status_code}"
                print(f"  {last_error}")

        except requests.exceptions.RequestException as e:
            last_error = f"Request error: {e}"
            print(f"  {last_error}")

    print(f"  Failed to generate image {index + 1} after {MAX_RETRIES} attempts. Last error: {last_error}")
    return None, None


def get_file_sha(github_token: str, owner: str, repo: str, file_path: str, branch: str = "main") -> str:
    """Get the SHA of an existing file"""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}"
    }

    response = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{file_path}?ref={branch}",
        headers=headers
    )

    if response.status_code == 200:
        return response.json().get("sha", "")
    return ""


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
    json_path = f"NEWS/transformed/instagram/posts/{today}.json"
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
            print("PR already exists for this branch")
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

    # Step 2: Research trending content
    print(f"\n=== Researching Instagram Trends ===")
    trends = research_trending_content(pollinations_token)

    # Step 3: Generate post strategy
    print(f"\n=== Generating Post Strategy ===")
    strategy = generate_post_strategy(merged_prs, trends, pollinations_token)

    if not strategy:
        print("Failed to generate strategy. Exiting.")
        sys.exit(1)

    # Step 4: Generate images - AI decides if linked (I2I) or standalone
    use_linked_images = strategy.get('linked_images', True)
    if use_linked_images:
        print(f"\n=== Generating Images (LINKED - I2I chaining for visual continuity) ===")
    else:
        print(f"\n=== Generating Images (STANDALONE - each generated fresh) ===")

    images = []
    image_urls = []  # Track URLs for the final post
    previous_image_url = None  # For I2I reference (only used if linked_images=true)

    for i, img_info in enumerate(strategy.get('images', [])):
        prompt = img_info.get('prompt', '')
        if not prompt:
            continue

        # Generate image - only use I2I reference if linked_images=true AND not first image
        reference_url = None
        if use_linked_images and i > 0 and previous_image_url:
            reference_url = previous_image_url

        image_bytes, public_url = generate_image(
            prompt,
            pollinations_token,
            i,
            reference_url=reference_url
        )

        if image_bytes:
            images.append(image_bytes)
            image_urls.append(public_url)

            # Use public URL (without key) as reference for next image (only if linked)
            if use_linked_images:
                previous_image_url = public_url
        else:
            images.append(None)
            image_urls.append(None)

        time.sleep(3)  # Rate limiting between images

    successful_images = sum(1 for img in images if img is not None)
    print(f"Generated {successful_images}/{len(strategy.get('images', []))} images")

    if successful_images == 0:
        print("No images generated successfully. Exiting.")
        sys.exit(1)

    # Step 5: Create PR
    print(f"\n=== Creating PR ===")
    create_post_pr(strategy, images, image_urls, merged_prs, github_token, owner_name, repo_name)

    print("\n=== Done! ===")


if __name__ == "__main__":
    main()
