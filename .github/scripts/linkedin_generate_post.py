#!/usr/bin/env python3
"""
LinkedIn Post Generator - Creates professional LinkedIn posts with images from PR updates
Designed for thought leadership and industry credibility
"""

import os
import sys
import json
import time
import random
import re
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
MODEL = "openai-large"  # GPT-4o for professional tone
IMAGE_MODEL = "nanobanana"  # Same as Instagram
MAX_SEED = 2147483647
MAX_RETRIES = 3
INITIAL_RETRY_DELAY = 2

# LinkedIn image settings (1200x627 is optimal for LinkedIn)
IMAGE_WIDTH = 1200
IMAGE_HEIGHT = 627


def get_env(key: str, required: bool = True) -> Optional[str]:
    """Get environment variable with optional requirement check"""
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def get_date_range(days_back: int = 7) -> tuple[datetime, datetime]:
    """Get date range for the specified number of days back"""
    now = datetime.now(timezone.utc)
    end_date = now
    start_date = end_date - timedelta(days=days_back)
    return start_date, end_date


def get_merged_prs(owner: str, repo: str, start_date: datetime, token: str) -> List[Dict]:
    """Fetch merged PRs using GraphQL"""
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
        variables = {"owner": owner, "repo": repo, "cursor": cursor}

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
            break

        if not page_info["hasNextPage"]:
            break

        cursor = page_info["endCursor"]
        page += 1

    return all_prs


def call_pollinations_api(system_prompt: str, user_prompt: str, token: str, temperature: float = 0.7) -> Optional[str]:
    """Call Pollinations AI API with retry logic"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    last_error = None

    for attempt in range(MAX_RETRIES):
        seed = random.randint(0, MAX_SEED)

        payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature,
            "seed": seed
        }

        if attempt > 0:
            backoff_delay = INITIAL_RETRY_DELAY * (2 ** attempt)
            print(f"  Retry {attempt}/{MAX_RETRIES - 1} (waiting {backoff_delay}s)")
            time.sleep(backoff_delay)

        try:
            response = requests.post(
                POLLINATIONS_API_BASE,
                headers=headers,
                json=payload,
                timeout=120
            )

            if response.status_code == 200:
                result = response.json()
                return result['choices'][0]['message']['content']
            else:
                last_error = f"API error: {response.status_code}"
                print(f"  {last_error}: {response.text[:500]}")

        except requests.exceptions.RequestException as e:
            last_error = f"Request failed: {e}"
            print(f"  {last_error}")

    print(f"All {MAX_RETRIES} attempts failed. Last error: {last_error}")
    return None


def generate_image(prompt: str, token: str, index: int = 0) -> tuple[Optional[bytes], Optional[str]]:
    """Generate a single image using Pollinations nanobanana"""

    encoded_prompt = quote(prompt)
    base_url = f"{POLLINATIONS_IMAGE_BASE}/{encoded_prompt}"

    print(f"\n  Generating image {index + 1}: {prompt[:80]}...")

    last_error = None

    for attempt in range(MAX_RETRIES):
        seed = random.randint(0, MAX_SEED)

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

        if attempt == 0:
            print(f"  Using seed: {seed}")
        else:
            backoff_delay = INITIAL_RETRY_DELAY * (2 ** attempt)
            print(f"  Retry {attempt}/{MAX_RETRIES - 1} with new seed: {seed} (waiting {backoff_delay}s)")
            time.sleep(backoff_delay)

        try:
            response = requests.get(base_url, params=params, timeout=300)

            if response.status_code == 200:
                content_type = response.headers.get('content-type', '')
                if 'image' in content_type:
                    image_bytes = response.content

                    if len(image_bytes) < 1000:
                        last_error = f"Image too small ({len(image_bytes)} bytes)"
                        print(f"  {last_error}")
                        continue

                    # Check valid image format
                    is_jpeg = image_bytes[:2] == b'\xff\xd8'
                    is_png = image_bytes[:8] == b'\x89PNG\r\n\x1a\n'
                    is_webp = image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP'

                    if not (is_jpeg or is_png or is_webp):
                        last_error = f"Invalid image format"
                        print(f"  {last_error}")
                        continue

                    img_format = "JPEG" if is_jpeg else ("PNG" if is_png else "WebP")
                    print(f"  Image generated successfully ({img_format}, {len(image_bytes):,} bytes)")

                    # Build public URL without key
                    public_params = {k: v for k, v in params.items() if k != "key"}
                    public_url = base_url + "?" + "&".join(f"{k}={v}" for k, v in public_params.items())

                    return image_bytes, public_url
                else:
                    last_error = f"Unexpected content type: {content_type}"
                    print(f"  {last_error}")
            else:
                last_error = f"HTTP error: {response.status_code}"
                print(f"  {last_error}")

        except requests.exceptions.RequestException as e:
            last_error = f"Request error: {e}"
            print(f"  {last_error}")

    print(f"  Failed to generate image after {MAX_RETRIES} attempts")
    return None, None


def generate_linkedin_post(prs: List[Dict], token: str) -> Optional[Dict]:
    """Generate a professional LinkedIn post with image from PR updates"""

    # Format PRs for context
    pr_summary = ""
    if prs:
        pr_summary = f"WEEKLY UPDATES ({len(prs)} merged PRs):\n"
        for pr in prs[:20]:
            labels_str = f" [{', '.join(pr['labels'])}]" if pr['labels'] else ""
            pr_summary += f"- #{pr['number']}: {pr['title']}{labels_str}\n"
            if pr['body']:
                pr_summary += f"  {pr['body'][:150]}...\n"
    else:
        pr_summary = "NO UPDATES THIS WEEK"

    system_prompt = f"""You are a senior tech communications strategist for Pollinations.ai.
Your job is to write PROFESSIONAL LinkedIn posts with accompanying images.

{pr_summary}

=== ABOUT POLLINATIONS.AI ===
- Open-source AI generation platform (images, text, audio)
- 500+ apps built by developers worldwide
- Free tier available, used by indie devs, startups, students
- Mission: democratize AI creativity
- Philosophy: "Soft, simple tools for people who want to build with heart"

=== LINKEDIN VOICE & TONE ===
PROFESSIONAL but not boring. Think:
- Tech industry insider sharing genuine insights
- Founder who's building in public
- Expert who makes complex topics accessible

DO:
- Lead with a compelling hook (first 2 lines show before "see more")
- Share genuine learnings, not just announcements
- Use industry-relevant insights
- Include 1 concrete metric or achievement when possible
- End with thoughtful question or clear CTA
- Use line breaks for readability
- 3-5 relevant hashtags at the end

DON'T:
- Sound like a press release
- Use buzzword soup ("synergy", "leverage", "paradigm shift")
- Be overly salesy or promotional
- Use too many emojis (1-2 max, professional ones)
- Write walls of text

=== IMAGE STYLE (CRITICAL - for nanobanana model) ===
LinkedIn images should be:
- INFORMATIVE: Include text overlays with key stats/metrics
- PROFESSIONAL but FRIENDLY: Clean design, not corporate boring
- HAPPY/POSITIVE vibes: Celebrating wins, growth, community
- MEME-INSPIRED but TASTEFUL: Can reference tech memes subtly
- Colors: Lime green (#ecf874) as accent, soft pastels, clean whites

Image ideas:
- Infographic style with key numbers (e.g., "49 PRs shipped this week")
- Happy illustrated characters celebrating milestones
- Clean dashboard/metrics visualization
- Growth charts with friendly illustrations
- Developer community celebration scenes

AVOID in images:
- Dark/dramatic imagery
- Corporate stock photo vibes
- Overly complex designs
- Pure meme formats (save those for Twitter)

=== POST TYPES (pick the best fit) ===
1. MILESTONE: Celebrating achievements (X apps built, Y users, new feature)
2. INSIGHT: Industry observation tied to our work
3. BEHIND_THE_SCENES: What we learned shipping this week
4. THOUGHT_LEADERSHIP: Perspective on AI/open-source/developer tools

=== OUTPUT FORMAT (JSON only) ===
{{
    "post_type": "milestone|insight|behind_the_scenes|thought_leadership",
    "hook": "First 1-2 lines that appear before 'see more' - make it compelling",
    "body": "Main content - insights, learnings, details. Use line breaks.",
    "cta": "Call to action or closing thought",
    "hashtags": ["#OpenSource", "#AI", "#DevTools", "#BuildInPublic", "#TechStartup"],
    "image_prompt": "Detailed prompt for LinkedIn image. Professional infographic style with text overlays. Include specific text to show in image. Lime green (#ecf874) accents, clean modern design, friendly and informative.",
    "image_text": "Key text/stats to display in the image",
    "reasoning": "Why this angle works for LinkedIn audience"
}}

=== EXAMPLE IMAGE PROMPTS ===
- "Professional infographic showing '49 PRs Merged This Week' with happy cartoon developers celebrating. Clean white background, lime green (#ecf874) accent colors, modern sans-serif typography. Growth chart trending up. Friendly tech illustration style."
- "Clean dashboard visualization showing developer metrics. Text overlay: '500+ Apps Built'. Soft gradients, lime green highlights, minimalist design. Happy bee mascot in corner. Professional but warm."
- "Illustrated celebration scene of diverse developers high-fiving. Banner text: 'Open Source Wins'. Confetti, lime green (#ecf874) color scheme, modern flat illustration style. Informative and joyful."
"""

    if prs:
        user_prompt = f"""Create a LinkedIn post with image about this week's development work.
Focus on the most interesting/impactful updates: {[pr['title'] for pr in prs[:5]]}
Total PRs merged: {len(prs)}

Make it professional, insightful, and worth engaging with.
Include an image prompt that's informative with text/stats overlay.
Output valid JSON only."""
    else:
        user_prompt = """No code updates this week - create thought leadership content.

Pick ONE angle:
- Open source AI ecosystem observations
- Developer community building
- AI democratization mission
- Building in public philosophy

Make it professional, insightful, and worth engaging with.
Include an image prompt that's informative with text/stats overlay.
Output valid JSON only."""

    print("Generating LinkedIn post...")
    response = call_pollinations_api(system_prompt, user_prompt, token, temperature=0.7)

    if not response:
        print("Post generation failed")
        return None

    try:
        response = response.strip()
        if response.startswith("```"):
            lines = response.split("\n")
            lines = [line for line in lines if not line.startswith("```")]
            response = "\n".join(lines)

        post_data = json.loads(response)
        print(f"Generated {post_data['post_type']} post")
        return post_data

    except json.JSONDecodeError as e:
        print(f"Failed to parse response: {e}")
        print(f"Response was: {response[:500]}")
        return None


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


def create_post_pr(post_data: Dict, image_url: Optional[str], prs: List[Dict], github_token: str, owner: str, repo: str):
    """Create a PR with the LinkedIn post JSON"""

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
    branch_name = f"linkedin-post-{today}"
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

    # Build the full post text
    full_post = post_data['hook'] + "\n\n" + post_data['body']
    if post_data.get('cta'):
        full_post += "\n\n" + post_data['cta']
    full_post += "\n\n" + " ".join(post_data.get('hashtags', []))

    # Create the JSON post data
    output_data = {
        "date": today,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "platform": "linkedin",
        "post_type": post_data.get('post_type', 'insight'),
        "hook": post_data['hook'],
        "body": post_data['body'],
        "cta": post_data.get('cta', ''),
        "full_post": full_post,
        "hashtags": post_data.get('hashtags', []),
        "image": {
            "url": image_url,
            "prompt": post_data.get('image_prompt', ''),
            "text": post_data.get('image_text', '')
        } if image_url else None,
        "reasoning": post_data.get('reasoning', ''),
        "pr_references": [f"#{pr['number']}" for pr in prs] if prs else [],
        "char_count": len(full_post)
    }

    # Create JSON file
    json_path = f"social/news/transformed/linkedin/posts/{today}.json"
    json_content = json.dumps(output_data, indent=2, ensure_ascii=False)
    json_encoded = base64.b64encode(json_content.encode()).decode()

    # Check if file exists
    json_sha = get_file_sha(github_token, owner, repo, json_path, branch_name)
    if not json_sha:
        json_sha = get_file_sha(github_token, owner, repo, json_path, "main")

    json_payload = {
        "message": f"linkedin: add post for {today}",
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
    pr_title = f"LinkedIn Post - {today}"

    # Image preview in PR body
    image_preview = ""
    if image_url:
        image_preview = f"""
### Image
**Prompt:** {post_data.get('image_prompt', 'N/A')[:200]}...
**Text in image:** {post_data.get('image_text', 'N/A')}

![Preview]({image_url})
"""

    pr_body = f"""## LinkedIn Post for {today}

**Post Type:** {output_data['post_type']}
**Character Count:** {output_data['char_count']}

### Hook
{output_data['hook']}

### Body
{output_data['body']}

### CTA
{output_data['cta']}

### Hashtags
{' '.join(output_data['hashtags'])}
{image_preview}
---

**Reasoning:** {output_data['reasoning']}

**PR References:** {', '.join(output_data['pr_references']) if output_data['pr_references'] else 'None (thought leadership)'}

---
When this PR is merged, the post will be published to LinkedIn via Buffer.

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

    pr_info = pr_response.json()
    print(f"Created PR #{pr_info['number']}: {pr_info['html_url']}")

    # Add labels
    pr_labels = get_env('PR_LABELS', required=False)
    if pr_labels:
        labels_list = [label.strip() for label in pr_labels.split(',')]
        requests.post(
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/issues/{pr_info['number']}/labels",
            headers=headers,
            json={"labels": labels_list}
        )


def main():
    github_token = get_env('GITHUB_TOKEN')
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    repo_full_name = get_env('GITHUB_REPOSITORY')
    source_repo = get_env('SOURCE_REPO', required=False) or "pollinations/pollinations"
    days_back = int(get_env('DAYS_BACK', required=False) or "7")
    force_thought_leadership = get_env('FORCE_THOUGHT_LEADERSHIP', required=False) == "true"

    owner_name, repo_name = repo_full_name.split('/')
    source_owner, source_repo_name = source_repo.split('/')

    # Fetch merged PRs (unless forcing thought leadership content)
    merged_prs = []
    if force_thought_leadership:
        print(f"\n=== Forcing Thought Leadership Content ===")
    else:
        start_date, _ = get_date_range(days_back)
        print(f"\n=== Fetching PRs from {source_repo} (last {days_back} days) ===")
        merged_prs = get_merged_prs(source_owner, source_repo_name, start_date, github_token)
        print(f"Found {len(merged_prs)} merged PRs")

    # Generate post
    print(f"\n=== Generating LinkedIn Post ===")
    post_data = generate_linkedin_post(merged_prs, pollinations_token)

    if not post_data:
        print("Failed to generate post. Exiting.")
        sys.exit(1)

    # Generate image
    print(f"\n=== Generating Image ===")
    image_url = None
    if post_data.get('image_prompt'):
        _, image_url = generate_image(post_data['image_prompt'], pollinations_token)
        if not image_url:
            print("Warning: Failed to generate image, continuing without it")

    # Create PR
    print(f"\n=== Creating PR ===")
    create_post_pr(post_data, image_url, merged_prs, github_token, owner_name, repo_name)

    print("\n=== Done! ===")


if __name__ == "__main__":
    main()
