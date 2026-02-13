#!/usr/bin/env python3
"""
Common utilities for social media post generators.
Shared code for LinkedIn, Twitter, and other platforms.
"""

import os
import sys
import time
import random
import requests
from typing import Dict, List, Optional
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from pathlib import Path

# API Endpoints
GITHUB_API_BASE = "https://api.github.com"
GITHUB_GRAPHQL_API = "https://api.github.com/graphql"
POLLINATIONS_API_BASE = "https://gen.pollinations.ai/v1/chat/completions"
POLLINATIONS_IMAGE_BASE = "https://gen.pollinations.ai/image"

# Models - single source of truth for all social scripts
MODEL = "gemini-large"  # Text generation model
IMAGE_MODEL = "nanobanana-pro"  # Image generation model
WEBSEARCH_MODEL = "perplexity-reasoning"  # Web search model (used by Instagram)

# Limits and retry settings
MAX_SEED = 2147483647
MAX_RETRIES = 3
INITIAL_RETRY_DELAY = 2

# Discord-specific
DISCORD_CHAR_LIMIT = 2000
DISCORD_CHUNK_SIZE = 1900  # Leave room for safety

# Get the directory where this script lives
SCRIPTS_DIR = Path(__file__).parent
PROMPTS_DIR = SCRIPTS_DIR.parent / "prompts"
SHARED_PROMPTS_DIR = PROMPTS_DIR / "_shared"

# Cache for shared prompts (loaded once)
_shared_prompts_cache: Dict[str, str] = {}


def get_repo_root() -> str:
    """Get the repository root directory by looking for .git folder"""
    current = os.path.dirname(os.path.abspath(__file__))
    while current != '/':
        if os.path.exists(os.path.join(current, '.git')):
            return current
        current = os.path.dirname(current)
    return os.getcwd()


def load_shared(name: str) -> str:
    """Load a shared prompt component from prompts/_shared/{name}.md
    
    Args:
        name: 'about'
    
    Returns:
        The shared prompt content
    """
    if name in _shared_prompts_cache:
        return _shared_prompts_cache[name]
    
    shared_path = SHARED_PROMPTS_DIR / f"{name}.md"
    
    if not shared_path.exists():
        print(f"Warning: Shared prompt not found: {shared_path}")
        return ""
    
    with open(shared_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Remove markdown title and HTML comments
    lines = content.split("\n")
    filtered_lines = []
    for line in lines:
        if line.startswith("#") and not filtered_lines:
            continue  # Skip first heading
        if line.strip().startswith("<!--") and line.strip().endswith("-->"):
            continue  # Skip single-line HTML comments
        filtered_lines.append(line)
    
    content = "\n".join(filtered_lines).strip()
    _shared_prompts_cache[name] = content
    return content


def _inject_shared_prompts(content: str) -> str:
    """Inject shared prompt components into content

    Replaces placeholders with shared content:
    - {about} -> _shared/about.md
    - {visual_style} -> _shared/visual_style.md
    """
    if "{about}" in content:
        content = content.replace("{about}", load_shared("about"))
    if "{visual_style}" in content:
        content = content.replace("{visual_style}", load_shared("visual_style"))
    return content


def get_env(key: str, required: bool = True) -> Optional[str]:
    """Get environment variable with optional requirement check"""
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def load_prompt(platform: str, prompt_name: str) -> str:
    """Load a prompt file from social/prompts/{platform}/{prompt_name}.md
    
    Automatically injects shared components:
    - {about} -> content from _shared/about.md
    - {visual_style} -> content from _shared/visual_style.md
    
    Args:
        platform: 'linkedin', 'twitter', 'instagram', 'reddit', etc.
        prompt_name: 'system', 'user_with_prs', 'user_thought_leadership', etc.
    
    Returns:
        The prompt content as a string with shared components injected
    """
    prompt_path = PROMPTS_DIR / platform / f"{prompt_name}.md"
    
    if not prompt_path.exists():
        print(f"Warning: Prompt file not found: {prompt_path}")
        return ""
    
    with open(prompt_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Remove the markdown title (first line starting with #)
    lines = content.split("\n")
    if lines and lines[0].startswith("#"):
        content = "\n".join(lines[1:]).strip()
    
    # Inject shared prompt components
    content = _inject_shared_prompts(content)
    
    return content


def get_date_range(days_back: int = 1) -> tuple[datetime, datetime]:
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


def call_pollinations_api(
    system_prompt: str,
    user_prompt: str,
    token: str,
    temperature: float = 0.7,
    max_retries: int = None,
    model: str = None,
    verbose: bool = False,
    exit_on_failure: bool = False
) -> Optional[str]:
    """Call Pollinations AI API with retry logic and exponential backoff
    
    Args:
        system_prompt: System prompt for the AI
        user_prompt: User prompt for the AI
        token: Pollinations API token
        temperature: Temperature for generation (default 0.7)
        max_retries: Number of retries (default MAX_RETRIES from constants)
        model: Model to use (default MODEL from constants)
        verbose: If True, print full prompts sent to API
        exit_on_failure: If True, sys.exit(1) on failure instead of returning None
    
    Returns:
        Response content or None if failed (exits if exit_on_failure=True)
    """
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    use_model = model or MODEL
    retries = max_retries if max_retries is not None else MAX_RETRIES
    last_error = None

    # Verbose logging
    if verbose:
        print(f"\n  [VERBOSE] API Call to {POLLINATIONS_API_BASE}")
        print(f"  [VERBOSE] Model: {use_model}")
        print(f"  [VERBOSE] Temperature: {temperature}")
        print(f"  [VERBOSE] System prompt ({len(system_prompt)} chars):")
        print(f"  ---BEGIN SYSTEM PROMPT---")
        print(system_prompt[:2000] + ("..." if len(system_prompt) > 2000 else ""))
        print(f"  ---END SYSTEM PROMPT---")
        print(f"  [VERBOSE] User prompt ({len(user_prompt)} chars):")
        print(f"  ---BEGIN USER PROMPT---")
        print(user_prompt[:2000] + ("..." if len(user_prompt) > 2000 else ""))
        print(f"  ---END USER PROMPT---")

    for attempt in range(retries):
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
            if verbose:
                print(f"  Using seed: {seed}")
        else:
            backoff_delay = INITIAL_RETRY_DELAY * (2 ** attempt)
            print(f"  Retry {attempt}/{retries - 1} with new seed: {seed} (waiting {backoff_delay}s)")
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
                    content = result['choices'][0]['message']['content']
                    if verbose:
                        print(f"  [VERBOSE] Response ({len(content)} chars):")
                        print(f"  ---BEGIN RESPONSE---")
                        print(content[:3000] + ("..." if len(content) > 3000 else ""))
                        print(f"  ---END RESPONSE---")
                    return content
                except (KeyError, IndexError, json.JSONDecodeError) as e:
                    last_error = f"Error parsing API response: {e}"
                    error_preview = response.text[:500] + "..." if len(response.text) > 500 else response.text
                    print(f"  {last_error}")
                    print(f"  Response preview: {error_preview}")
            else:
                last_error = f"API error: {response.status_code}"
                error_preview = response.text[:500] + "..." if len(response.text) > 500 else response.text
                print(f"  {last_error}")
                print(f"  Error preview: {error_preview}")

        except requests.exceptions.RequestException as e:
            last_error = f"Request failed: {e}"
            print(f"  {last_error}")

    print(f"All {retries} attempts failed. Last error: {last_error}")
    
    if exit_on_failure:
        sys.exit(1)
    return None


def generate_image(prompt: str, token: str, width: int = 2048, height: int = 2048, index: int = 0) -> tuple[Optional[bytes], Optional[str]]:
    """Generate a single image using Pollinations nanobanana"""

    encoded_prompt = quote(prompt)
    base_url = f"{POLLINATIONS_IMAGE_BASE}/{encoded_prompt}"

    print(f"\n  Generating image {index + 1}: {prompt[:80]}...")

    last_error = None

    for attempt in range(MAX_RETRIES):
        seed = random.randint(0, MAX_SEED)

        params = {
            "model": IMAGE_MODEL,
            "width": width,
            "height": height,
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


def commit_image_to_branch(
    image_bytes: bytes,
    file_path: str,
    branch: str,
    github_token: str,
    owner: str,
    repo: str,
) -> Optional[str]:
    """Commit an image file to a GitHub branch and return a raw URL.

    Returns the raw.githubusercontent.com URL on success, None on failure.
    """
    import base64 as _b64

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
    }

    encoded = _b64.b64encode(image_bytes).decode()

    # Check if file already exists on this branch
    sha = get_file_sha(github_token, owner, repo, file_path, branch)

    payload = {
        "message": f"add image {file_path.split('/')[-1]}",
        "content": encoded,
        "branch": branch,
    }
    if sha:
        payload["sha"] = sha

    resp = requests.put(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{file_path}",
        headers=headers,
        json=payload,
    )

    if resp.status_code in [200, 201]:
        raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/main/{file_path}"
        print(f"  Committed image to {file_path}")
        return raw_url

    print(f"  Failed to commit image: {resp.status_code} {resp.text[:200]}")
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


def format_pr_summary(prs: List[Dict], time_label: str = "TODAY") -> str:
    """Format PRs into a summary string for prompts
    
    Args:
        prs: List of PR dictionaries
        time_label: Label to use (e.g., "TODAY", "WEEKLY")
    
    Returns:
        Formatted summary string
    """
    if prs:
        pr_summary = f"{time_label}'S UPDATES ({len(prs)} merged PRs):\n"
        for pr in prs[:20]:
            labels_str = f" [{', '.join(pr['labels'])}]" if pr['labels'] else ""
            pr_summary += f"- #{pr['number']}: {pr['title']}{labels_str}\n"
            if pr['body']:
                pr_summary += f"  {pr['body'][:150]}...\n"
    else:
        pr_summary = f"NO UPDATES {time_label}"
    
    return pr_summary
