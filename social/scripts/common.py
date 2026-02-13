#!/usr/bin/env python3
"""
Common utilities for social media post generators.
Shared code for LinkedIn, Twitter, and other platforms.
"""

import os
import sys
import time
import json
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
DEFAULT_TIMEOUT = 30  # seconds for GitHub API / general requests

# Repository constants
OWNER = "pollinations"
REPO = "pollinations"

# Image generation
IMAGE_SIZE = 2048

# Discord-specific
DISCORD_CHAR_LIMIT = 2000
DISCORD_CHUNK_SIZE = 1900  # Leave room for safety

# Get the directory where this script lives
SCRIPTS_DIR = Path(__file__).parent
PROMPTS_DIR = SCRIPTS_DIR.parent / "prompts"
BRAND_DIR = PROMPTS_DIR / "brand"

# Cache for shared prompts (loaded once)
_shared_prompts_cache: Dict[str, str] = {}


def github_api_request(
    method: str,
    url: str,
    headers: Dict,
    timeout: int = None,
    max_retries: int = 3,
    **kwargs,
) -> requests.Response:
    """Make a GitHub API request with retry on transient failures (5xx, 429)."""
    _timeout = timeout or DEFAULT_TIMEOUT
    last_exc = None
    for attempt in range(max_retries):
        try:
            resp = requests.request(method, url, headers=headers, timeout=_timeout, **kwargs)
            if resp.status_code < 500 and resp.status_code != 429:
                return resp
            print(f"  GitHub API {resp.status_code} on attempt {attempt + 1}/{max_retries}")
        except requests.exceptions.RequestException as e:
            last_exc = e
            print(f"  GitHub API request error on attempt {attempt + 1}/{max_retries}: {e}")
        if attempt < max_retries - 1:
            delay = INITIAL_RETRY_DELAY * (2 ** attempt)
            time.sleep(delay)
    # Exhausted retries — raise on network error, return 5xx response for callers to handle
    if last_exc:
        raise last_exc
    print(f"  WARNING: GitHub API returned {resp.status_code} after {max_retries} retries: {url}")
    return resp


def parse_json_response(response: str) -> Optional[Dict]:
    """Parse JSON from AI response, stripping markdown fences."""
    text = response.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        print(f"  JSON parse error: {e}")
        print(f"  Response: {text[:500]}")
        return None


def get_repo_root() -> str:
    """Get the repository root directory by looking for .git folder"""
    current = os.path.dirname(os.path.abspath(__file__))
    while current != '/':
        if os.path.exists(os.path.join(current, '.git')):
            return current
        current = os.path.dirname(current)
    return os.getcwd()


def load_shared(name: str) -> str:
    """Load a brand prompt component from prompts/brand/{name}.md

    Args:
        name: 'about', 'visual', 'bee', 'links'

    Returns:
        The brand prompt content
    """
    if name in _shared_prompts_cache:
        return _shared_prompts_cache[name]

    shared_path = BRAND_DIR / f"{name}.md"

    if not shared_path.exists():
        print(f"Warning: Brand prompt not found: {shared_path}")
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
    """Inject brand prompt components into content

    Replaces placeholders with brand content:
    - {about} -> brand/about.md
    - {visual_style} -> brand/visual.md
    - {bee_character} -> brand/bee.md
    - {links} -> brand/links.md
    """
    if "{about}" in content:
        content = content.replace("{about}", load_shared("about"))
    if "{visual_style}" in content:
        content = content.replace("{visual_style}", load_shared("visual"))
    if "{bee_character}" in content:
        content = content.replace("{bee_character}", load_shared("bee"))
    if "{links}" in content:
        content = content.replace("{links}", load_shared("links"))
    return content


def get_env(key: str, required: bool = True) -> Optional[str]:
    """Get environment variable with optional requirement check"""
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def load_prompt(name: str) -> str:
    """Load a prompt file from social/prompts/{name}.md

    Automatically injects brand components:
    - {about} -> content from brand/about.md
    - {visual_style} -> content from brand/visual.md
    - {bee_character} -> content from brand/bee.md
    - {links} -> content from brand/links.md

    Args:
        name: 'tone/twitter', 'gist', 'highlights', etc.

    Returns:
        The prompt content as a string with brand components injected
    """
    prompt_path = PROMPTS_DIR / f"{name}.md"
    
    if not prompt_path.exists():
        print(f"Warning: Prompt file not found: {prompt_path}")
        return ""
    
    with open(prompt_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Remove the markdown title (first line starting with #)
    lines = content.split("\n")
    if lines and lines[0].startswith("#"):
        content = "\n".join(lines[1:]).strip()
    
    # Inject brand prompt components
    content = _inject_shared_prompts(content)

    return content


def load_format(platform: str) -> str:
    """Load the ## {platform} section from prompts/format.md.

    Args:
        platform: 'Twitter', 'LinkedIn', 'Instagram', 'Reddit', 'Discord', 'Realtime'

    Returns:
        The section content (without the ## heading)
    """
    content = load_prompt("format")
    if not content:
        return ""

    lines = content.split("\n")
    section_lines = []
    in_section = False

    for line in lines:
        if line.startswith("## "):
            if in_section:
                break
            if line[3:].strip().lower() == platform.lower():
                in_section = True
                continue
        elif in_section:
            section_lines.append(line)

    if not section_lines:
        print(f"Warning: No ## {platform} section found in format.md")

    return "\n".join(section_lines).strip()


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

        response = github_api_request(
            "POST",
            GITHUB_GRAPHQL_API,
            headers=headers,
            json={"query": query, "variables": variables},
            timeout=60,
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
    """Call pollinations.ai API with retry logic and exponential backoff

    Args:
        system_prompt: System prompt for the AI
        user_prompt: User prompt for the AI
        token: pollinations.ai API token
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
    """Generate a single image via the pollinations.ai image API."""

    # Append bee character description if not already present (loaded from prompt file)
    if "bee mascot" not in prompt.lower():
        bee_desc = load_shared("bee")
        if bee_desc:
            prompt = f"{prompt} {bee_desc}"

    # Strip single quotes — they cause 400 errors from the image API even when URL-encoded
    sanitized = prompt.replace("'", "")
    encoded_prompt = quote(sanitized)
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

    resp = github_api_request(
        "PUT",
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

    response = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{file_path}?ref={branch}",
        headers=headers,
    )

    if response.status_code == 200:
        return response.json().get("sha", "")
    return ""


# ── Gist I/O helpers ─────────────────────────────────────────────────

# Directory where gist JSONs live, relative to repo root
GISTS_REL_DIR = "social/news/gists"

# Required top-level keys for a valid gist
_GIST_REQUIRED_KEYS = {"pr_number", "title", "author", "url", "merged_at"}

# Required keys inside gist.gist (the AI-generated analysis)
_GIST_AI_KEYS = {"category", "user_facing", "publish_tier", "importance",
                 "headline", "blurb", "summary", "impact", "keywords", "image_prompt"}

VALID_CATEGORIES = {"feature", "bug_fix", "improvement", "docs", "infrastructure", "community"}
VALID_PUBLISH_TIERS = {"none", "discord_only", "daily"}
VALID_IMPORTANCE = {"major", "minor"}


def validate_gist(gist: Dict) -> List[str]:
    """Validate a gist dict against the schema. Returns list of error strings (empty = valid)."""
    errors = []

    for key in _GIST_REQUIRED_KEYS:
        if key not in gist:
            errors.append(f"missing top-level key: {key}")

    ai = gist.get("gist")
    if ai is None:
        errors.append("missing 'gist' object")
        return errors

    for key in _GIST_AI_KEYS:
        if key not in ai:
            errors.append(f"missing gist.{key}")

    if ai.get("category") and ai["category"] not in VALID_CATEGORIES:
        errors.append(f"invalid category: {ai['category']}")
    if ai.get("publish_tier") and ai["publish_tier"] not in VALID_PUBLISH_TIERS:
        errors.append(f"invalid publish_tier: {ai['publish_tier']}")
    if ai.get("importance") and ai["importance"] not in VALID_IMPORTANCE:
        errors.append(f"invalid importance: {ai['importance']}")
    if "user_facing" in ai and not isinstance(ai["user_facing"], bool):
        errors.append("user_facing must be boolean")
    if "keywords" in ai and not isinstance(ai["keywords"], list):
        errors.append("keywords must be a list")

    return errors


def apply_publish_tier_rules(gist: Dict) -> str:
    """Apply hard rules for publish_tier. Returns the corrected tier."""
    ai = gist.get("gist", {})
    labels = [l.lower() for l in gist.get("labels", [])]
    ai_tier = ai.get("publish_tier", "daily")

    # Rule 1: deps/chore + not user-facing → discord_only
    if ("deps" in labels or "chore" in labels) and not ai.get("user_facing", False):
        return "discord_only"

    # Rule 2: feature label → at least daily
    if "feature" in labels:
        return "daily"

    return ai_tier


def build_minimal_gist(pr_number: int, title: str, author: str, url: str,
                       merged_at: str, labels: List[str]) -> Dict:
    """Build a minimal gist with PR metadata only (no AI fields).
    Used as fallback when AI analysis fails."""
    return {
        "pr_number": pr_number,
        "title": title,
        "author": author,
        "url": url,
        "merged_at": merged_at,
        "labels": labels,
        "gist": {
            "category": "infrastructure",
            "user_facing": False,
            "publish_tier": "discord_only",
            "importance": "minor",
            "summary": title,
            "impact": "",
            "keywords": [],
            "image_prompt": "",
        },
        "image": {"url": None, "prompt": None},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "_minimal": True,
    }


def gist_path_for_pr(pr_number: int, merged_at: str) -> str:
    """Return the repo-relative path for a gist file: social/news/gists/YYYY-MM-DD/PR-{n}.json"""
    date_str = merged_at[:10]  # YYYY-MM-DD from ISO timestamp
    return f"{GISTS_REL_DIR}/{date_str}/PR-{pr_number}.json"


def commit_gist_to_main(gist: Dict, github_token: str, owner: str, repo: str) -> bool:
    """Commit a gist JSON file to main via the GitHub Contents API.
    Returns True on success, False on failure."""
    file_path = gist_path_for_pr(gist["pr_number"], gist["merged_at"])
    content = json.dumps(gist, indent=2, ensure_ascii=False)

    import base64 as _b64
    encoded = _b64.b64encode(content.encode()).decode()

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
    }

    # Check if file already exists (re-run / retry scenario)
    sha = get_file_sha(github_token, owner, repo, file_path, "main")

    payload = {
        "message": f"chore(news): add gist for PR #{gist['pr_number']}",
        "content": encoded,
        "branch": "main",
    }
    if sha:
        payload["sha"] = sha

    resp = github_api_request(
        "PUT",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{file_path}",
        headers=headers,
        json=payload,
    )

    if resp.status_code in [200, 201]:
        print(f"  Committed gist to {file_path}")
        return True

    print(f"  Failed to commit gist: {resp.status_code} {resp.text[:200]}")
    return False


def read_gists_for_date(date_str: str, repo_root: str = None) -> List[Dict]:
    """Read all gist JSON files for a given date from the local repo.

    Args:
        date_str: YYYY-MM-DD
        repo_root: path to repo root (auto-detected if None)

    Returns:
        List of gist dicts sorted by pr_number
    """
    if repo_root is None:
        repo_root = get_repo_root()

    gist_dir = Path(repo_root) / GISTS_REL_DIR / date_str

    if not gist_dir.exists():
        return []

    gists = []
    for f in sorted(gist_dir.glob("PR-*.json")):
        try:
            with open(f, "r", encoding="utf-8") as fh:
                gists.append(json.load(fh))
        except (json.JSONDecodeError, OSError) as e:
            print(f"  Warning: skipping malformed gist {f}: {e}")

    return sorted(gists, key=lambda g: g.get("pr_number", 0))


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


def deploy_reddit_post(
    reddit_data: Dict,
    vps_host: str,
    vps_user: str,
    pkey,  # paramiko.PKey — paramiko imported lazily by callers
) -> bool:

    import paramiko

    title = reddit_data.get("title", "")
    image_url = reddit_data.get("image", {}).get("url", "")

    if not all([title, image_url, vps_host, vps_user, pkey]):
        print("  VPS: Missing required arguments")
        return False

    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        print(f"  VPS: Connecting to {vps_user}@{vps_host}...")

        ssh.connect(
            hostname=vps_host,
            username=vps_user,
            pkey=pkey,
            timeout=30,
            allow_agent=False,
            look_for_keys=False,
        )

        base_cmd = "cd /root/reddit_post_automation"

        sanitized_url = image_url.replace('LINKEOF', '').replace("'", "\\'").replace('"', '\\"').replace('$', '\\$').replace('`', '\\`')
        sanitized_title = title.replace('LINKEOF', '').replace("'", "\\'").replace('"', '\\"').replace('$', '\\$').replace('`', '\\`')

        update_link_cmd = f"""{base_cmd} && cat > src/link.ts << 'LINKEOF'
const LINK = "{sanitized_url}";
const TITLE = "{sanitized_title}";
export {{LINK, TITLE}};
LINKEOF
"""

        print("  VPS: Changing to /root/reddit_post_automation and updating link.ts...")
        ssh.exec_command(update_link_cmd)

        deploy_cmd = f"{base_cmd} && nohup bash ./bash/deploy.sh > deploy.log 2>&1 &"

        print("  VPS: Running deploy.sh from project directory...")
        ssh.exec_command(deploy_cmd)
        ssh.close()

        print("  VPS: Deployment script triggered successfully")
        print("  VPS: Logs will be available at /root/reddit_post_automation/deploy.log")
        return True

    except Exception as e:
        print(f"  VPS: {type(e).__name__}: {e}")
        return False
