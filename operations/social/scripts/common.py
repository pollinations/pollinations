#!/usr/bin/env python3
"""
Common utilities for social media post generators.
Shared code for LinkedIn, Twitter, and other platforms.
"""

import os
import sys
import time
import json
import calendar
import random
import requests
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote
from pathlib import Path

# API Endpoints
GITHUB_API_BASE = "https://api.github.com"
GEN_BASE = "https://gen.pollinations.ai"
POLLINATIONS_API_BASE = "https://gen.pollinations.ai/v1/chat/completions"
POLLINATIONS_IMAGE_BASE = "https://gen.pollinations.ai/image"

# Models - single source of truth for all social scripts
MODEL = "openai/gpt-6-sol"  # Text generation model
IMAGE_MODEL = "nanobanana-2-lite"  # Image generation model

# Limits and retry settings
MAX_SEED = 2147483647
MAX_RETRIES = 3
INITIAL_RETRY_DELAY = 2
DEFAULT_TIMEOUT = 30  # seconds for GitHub API / general requests
LINKEDIN_MAX_CHARS = 1248

# Repository constants
OWNER = "pollinations"
REPO = "pollinations"
GISTS_BRANCH = "news"  # Unprotected branch for gist data (avoids main branch protection)
NEWS_REL_DIR = "operations/social/news"
DAILY_REL_DIR = f"{NEWS_REL_DIR}/daily"
WEEKLY_REL_DIR = f"{NEWS_REL_DIR}/weekly"
MONTHLY_REL_DIR = f"{NEWS_REL_DIR}/monthly"


# Models-weekly staging
MODELS_NEWS_DIR = f"{NEWS_REL_DIR}/models"


def models_news_staging_dir(date_str: str) -> str:
    """Workspace-local dir holding the artifacts to be committed to the news
    branch in a single tree commit. Generator writes them all here; publisher
    reads them, posts Discord, and only on success commits all four atomically.
    A publish failure leaves the news branch untouched, so next week's run
    re-detects and re-announces the same changes."""
    base = os.environ.get("RUNNER_TEMP") or "/tmp"
    path = os.path.join(base, f"models-news-{date_str}")
    os.makedirs(path, exist_ok=True)
    return path


def models_news_staged_files(date_str: str) -> list[tuple[str, str]]:
    """Returns [(local_filename, news_branch_path), ...] for the four artifacts
    committed atomically per weekly run."""
    return [
        ("discord.json", f"{MODELS_NEWS_DIR}/{date_str}/discord.json"),
        ("diff.json", f"{MODELS_NEWS_DIR}/diffs/{date_str}.json"),
        ("models.md", f"{MODELS_NEWS_DIR}/models.md"),
        ("snapshot.json", f"{MODELS_NEWS_DIR}/snapshots/{date_str}.json"),
    ]

# Image generation
IMAGE_SIZE = 2048
# Style suffix appended to every image prompt — ensures consistent pixel art style
# regardless of what the text AI writes in image_prompt fields
IMAGE_STYLE_SUFFIX = (
    "Cozy pixel art, 8-bit aesthetic, large visible chunky pixels, "
    "soft pastel gradients, warm ambient glow lighting, CRT glow effects. "
    "Lime green #ecf874 used BOLDLY. "
    "Tiny pixel sparkles and glowing particles floating in the air. Magical warm atmosphere. "
    "Lo-fi retro gaming vibes like Stardew Valley or A Short Hike. "
    "The attached image is a CHARACTER REFERENCE SHEET only — use it for character design, "
    "proportions, and art style consistency. Do NOT copy the layout or background from it. "
    "Only draw the characters mentioned in the prompt above, not all characters from the sheet. "
    "Polli (the bee), the monitor robot and Nomnom are each one unique individual: "
    "each appears at most once, never twice in the same picture."
)

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
    resp = None
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


def post_discord_webhook(
    webhook_url: str,
    *,
    json_body: Optional[Dict] = None,
    files: Optional[Dict] = None,
) -> requests.Response:
    """Retry explicit Discord server failures without replaying timed-out posts."""
    url = webhook_url
    if "wait=" not in url:
        url += ("&" if "?" in url else "?") + "wait=true"

    for attempt in range(MAX_RETRIES):
        if files is not None:
            resp = requests.post(url, files=files, timeout=30)
        else:
            resp = requests.post(url, json=json_body or {}, timeout=30)
        if resp.status_code < 500:
            return resp
        print(
            f"  Discord webhook {resp.status_code} on attempt "
            f"{attempt + 1}/{MAX_RETRIES}"
        )
        if attempt < MAX_RETRIES - 1:
            time.sleep(INITIAL_RETRY_DELAY * (2 ** attempt))
    return resp


def chunk_message(message: str, max_length: int = DISCORD_CHUNK_SIZE):
    """Split message into chunks at paragraph breaks."""
    if len(message) <= max_length:
        return [message]

    chunks = []
    remaining = message
    while remaining:
        if len(remaining) <= max_length:
            chunks.append(remaining)
            break
        chunk = remaining[:max_length]
        # Split at paragraph break
        split = chunk.rfind("\n\n")
        if split >= max_length * 0.5:
            split_point = split + 2
        else:
            split = chunk.rfind("\n")
            if split >= max_length * 0.5:
                split_point = split + 1
            else:
                split_point = max_length
        chunks.append(remaining[:split_point].rstrip())
        remaining = remaining[split_point:].lstrip()
    return chunks


def safe_truncate(text: str, limit: int) -> str:
    """Truncate to <= limit characters without cutting mid-token.

    - Walks back to the last whitespace before the cut so we don't split a
      word, URL, or `<@&123>` role mention.
    - Drops a trailing partial code span (odd count of backticks) by
      rewinding to before the last backtick.
    - Drops any trailing partial `<...>` (e.g. `<@&12`) so Discord doesn't
      render broken markup.
    - Appends "…" as a visible truncation marker.
    """
    if len(text) <= limit:
        return text
    cut = limit - 1  # leave room for the ellipsis
    head = text[:cut]
    # Prefer a newline boundary, then any whitespace. Always walk back to it
    # if one exists — a token that spans the cut (URL, role mention, code
    # span) is far more visible damage than dropping a line of bullet text.
    boundary = max(head.rfind("\n"), head.rfind(" "))
    if boundary > 0:
        head = head[:boundary]
    head = head.rstrip()
    # Strip a dangling unmatched '<' (broken mention or HTML-ish tag).
    last_lt = head.rfind("<")
    last_gt = head.rfind(">")
    if last_lt > last_gt:
        head = head[:last_lt].rstrip()
    # Close or drop a dangling unmatched code span.
    if head.count("`") % 2 == 1:
        last_backtick = head.rfind("`")
        head = head[:last_backtick].rstrip()
    return head + "…"


def parse_json_response(response: str) -> Optional[Dict]:
    """Parse JSON from AI response, stripping markdown fences."""
    text = response.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]  # remove opening fence (may include language specifier)
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]  # remove closing fence
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
    """Load a prompt file from operations/social/prompts/{name}.md

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
        return prompt_text(f.read())


def prompt_text(content: str) -> str:
    """Prompt text as sent: without its markdown title, brand components injected."""
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


def call_pollinations_api(
    system_prompt: str,
    user_prompt: str,
    token: str,
    temperature: float = 0.7,
    response_format: Optional[Dict] = None,
) -> Optional[str]:
    """Call pollinations.ai API with retry logic and exponential backoff

    Args:
        system_prompt: System prompt for the AI
        user_prompt: User prompt for the AI
        token: pollinations.ai API token
        temperature: Temperature for generation (default 0.7)
        response_format: Optional OpenAI-compatible response format

    Returns:
        Response content or None if failed
    """
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    last_error = None

    for attempt in range(MAX_RETRIES):
        payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature
        }
        if response_format is not None:
            payload["response_format"] = response_format

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
                try:
                    result = response.json()
                    content = result['choices'][0]['message']['content']
                    print(
                        f"  Text response: cache={response.headers.get('X-Cache', 'unknown')}, "
                        f"finish_reason={result['choices'][0].get('finish_reason')}, chars={len(content)}"
                    )
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

    print(f"All {MAX_RETRIES} attempts failed. Last error: {last_error}")
    return None


def generate_image(prompt: str, token: str, width: int = 2048, height: int = 2048, index: int = 0, model: str = None) -> tuple[Optional[bytes], Optional[str]]:
    """Generate a single image via the pollinations.ai image API."""
    use_model = model or IMAGE_MODEL

    # Append character descriptions if not already present (loaded from prompt file)
    if "bee mascot" not in prompt.lower():
        bee_desc = load_shared("bee")
        if bee_desc:
            prompt = f"{prompt} {bee_desc}"

    # Always append style suffix — forces consistent pixel art rendering
    prompt = f"{prompt} {IMAGE_STYLE_SUFFIX}"

    # Strip single quotes — they cause 400 errors from the image API even when URL-encoded
    sanitized = prompt.replace("'", "")
    encoded_prompt = quote(sanitized)
    base_url = f"{POLLINATIONS_IMAGE_BASE}/{encoded_prompt}"

    print(f"\n  Generating image {index + 1} (model={use_model}): {prompt[:80]}...")

    last_error = None

    for attempt in range(MAX_RETRIES):
        seed = random.randint(0, MAX_SEED)

        params = {
            "model": use_model,
            "width": width,
            "height": height,
            "quality": "hd",
            "seed": seed,
            "key": token,
            "image": "https://raw.githubusercontent.com/pollinations/pollinations/main/operations/social/prompts/brand/characters-ref.jpg",
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


def _github_headers(token: str) -> Dict:
    """Standard GitHub API headers."""
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
    }


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

    headers = _github_headers(github_token)

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
        raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{file_path}"
        print(f"  Committed image to {file_path}")
        return raw_url

    print(f"  Failed to commit image: {resp.status_code} {resp.text[:200]}")
    return None


def get_file_sha(github_token: str, owner: str, repo: str, file_path: str, branch: str = "main") -> str:
    """Get the SHA of an existing file"""
    headers = _github_headers(github_token)

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
GISTS_REL_DIR = f"{NEWS_REL_DIR}/gists"

# Required top-level keys for a valid gist
_GIST_REQUIRED_KEYS = {"pr_number", "title", "author", "url", "merged_at"}

# Required keys inside gist.gist (the AI-generated analysis)
_GIST_AI_KEYS = {"category", "user_facing", "publish_tier", "importance",
                 "summary", "keywords"}

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

    if not isinstance(ai.get("summary"), str) or not ai["summary"].strip():
        errors.append("gist.summary must be non-empty text")
    if not gist.get("image", {}).get("prompt"):
        errors.append("missing image.prompt")

    if "enrichment" in gist:
        for field in ("classification", "models"):
            if gist["enrichment"].get(field) not in {"complete", "failed"}:
                errors.append(f"invalid enrichment.{field}")
        if gist["enrichment"].get("classification") == "complete":
            sys.path.insert(0, get_repo_root())
            from operations.github.project_manager import area_names, read_brief, PR_TYPES, SOURCES
            if gist.get("area") not in [None, *area_names(read_brief())]:
                errors.append("invalid area")
            if gist.get("type") not in ([None] if gist.get("area") is None else PR_TYPES):
                errors.append("invalid type")
            if gist.get("source") not in SOURCES:
                errors.append("invalid source")
        for event in gist.get("announcements", []):
            if event.get("action") not in {"NEW", "UPDATE", "RETIRE"}:
                errors.append("invalid announcement action")
            if not event.get("model_id") or not isinstance(event.get("changes"), dict):
                errors.append("announcement requires model_id and changes")
            if event.get("effective_status") not in {"unconfirmed", "scheduled"}:
                errors.append("invalid announcement effective_status")

    return errors


def gist_context(gist: Dict) -> Dict:
    """The shared factual input for realtime, daily, weekly and highlights."""
    ai = gist.get("gist", {})
    return {
        **{key: gist.get(key) for key in (
            "pr_number", "title", "author", "url", "area", "type", "source", "app_name", "app_url"
        )},
        **{key: ai.get(key) for key in (
            "summary", "category", "importance", "user_facing", "keywords"
        )},
    }


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

def gist_path_for_pr(pr_number: int, merged_at: str) -> str:
    """Return the repo-relative path for a gist file: operations/social/news/gists/YYYY-MM-DD/PR-{n}.json"""
    date_str = merged_at[:10]  # YYYY-MM-DD from ISO timestamp
    return f"{GISTS_REL_DIR}/{date_str}/PR-{pr_number}.json"


def commit_gist(gist: Dict, github_token: str, owner: str, repo: str) -> bool:
    """Commit a gist JSON file to the news branch via the GitHub Contents API.
    Returns True on success, False on failure."""
    file_path = gist_path_for_pr(gist["pr_number"], gist["merged_at"])
    content = json.dumps(gist, indent=2, ensure_ascii=False)

    import base64 as _b64
    encoded = _b64.b64encode(content.encode()).decode()

    headers = _github_headers(github_token)

    # Check if file already exists (re-run / retry scenario)
    sha = get_file_sha(github_token, owner, repo, file_path, GISTS_BRANCH)

    payload = {
        "message": f"chore(news): add gist for PR #{gist['pr_number']}",
        "content": encoded,
        "branch": GISTS_BRANCH,
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
        print(f"  Committed gist to {file_path} on {GISTS_BRANCH}")
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


def filter_daily_gists(gists: List[Dict]) -> List[Dict]:
    """Filter gists to only those with publish_tier == 'daily'."""
    return [g for g in gists if g.get("gist", {}).get("publish_tier") == "daily"]


def read_gists_for_week(week_start: str, week_end: str, repo_root: Optional[str] = None) -> List[Dict]:
    """Read all gist JSON files for each day in the week range.
    Reads directly from local repo gists (no daily summary dependency)."""
    all_gists = []

    start = datetime.strptime(week_start, "%Y-%m-%d")
    end = datetime.strptime(week_end, "%Y-%m-%d")
    current = start

    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        day_gists = read_gists_for_date(date_str, repo_root)
        if day_gists:
            print(f"    {date_str}: {len(day_gists)} gists")
        all_gists.extend(day_gists)
        current += timedelta(days=1)

    return all_gists


def daily_summary_input(gists: List[Dict], date_str: str) -> str:
    """The daily summary call's user message: the day's gists."""
    gist_lines = []
    for g in gists:
        gist_lines.append(json.dumps(gist_context(g), indent=2))

    return f"""Date: {date_str}
Number of PRs: {len(gists)}

PR Gists:
{chr(10).join(gist_lines)}"""


def weekly_digest_input(gists: List[Dict], week_start: str, week_end: str) -> str:
    """The weekly digest call's user message: the week's gists, grouped by date."""
    by_date = defaultdict(list)
    for g in gists:
        date = g.get("merged_at", "")[:10] or "unknown"
        by_date[date].append(gist_context(g))

    gist_sections = []
    for date in sorted(by_date.keys()):
        gist_sections.append(json.dumps({
            "date": date,
            "pr_count": len(by_date[date]),
            "prs": by_date[date],
        }, indent=2))

    return f"""Week: {week_start} to {week_end}
Total PRs: {len(gists)}
Days with PRs: {len(by_date)}

PR gists by date:
{chr(10).join(gist_sections)}"""


def read_news_file(file_path: str, github_token: str, owner: str, repo: str) -> Optional[Dict]:
    """Read a JSON file from the news branch (local overlay first, GitHub API fallback).

    The workflow overlays operations/social/news/ from the news branch onto the local checkout,
    so local reads work during CI. Falls back to the GitHub API with ?ref=news.
    """
    # Try local first (workflow overlay)
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    # Fall back to GitHub API
    import base64 as _b64
    headers = _github_headers(github_token)
    resp = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{file_path}?ref={GISTS_BRANCH}",
        headers=headers,
    )
    if resp.status_code == 200:
        content = _b64.b64decode(resp.json()["content"]).decode()
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass
    return None


def generate_platform_post(
    platform: str,
    summary: Dict,
    token: str,
    preamble: str,
    temperature: float = 0.7,
    extra_context: str = "",
) -> Optional[Dict]:
    """Generate a platform post from a summary/digest.

    Args:
        platform: 'twitter', 'instagram', 'reddit', 'linkedin', 'discord'
        summary: The summary or digest dict (must have 'arcs' and optionally 'pr_summary', 'pr_count')
        token: Pollinations API token
        preamble: The opening instruction line (e.g. "Write a tweet about today's shipped work.")
        temperature: Generation temperature
        extra_context: Additional context appended to the task prompt

    Returns:
        Parsed JSON dict or None on failure
    """
    voice = load_prompt(f"tone/{platform}")
    task = f"{preamble}\n\n{post_recap(summary)}"
    task += "\n\n" + load_format(platform)
    if extra_context:
        task += extra_context

    response = call_pollinations_api(voice, task, token, temperature=temperature)
    if not response:
        return None
    return parse_json_response(response)


def post_recap(summary: Dict) -> str:
    """The part of a summary or digest that each platform post is written from."""
    pr_summary = summary.get("pr_summary", "")
    arcs = json.dumps(summary.get("arcs", []), indent=2)
    pr_count = summary.get("pr_count", 0)

    recap = f"{pr_summary}\n\nSelected updates with factual detail:\n{arcs}"
    if pr_count:
        recap += f"\nPRs selected for this recap: {pr_count}. This is not the total number of merges."
    return recap


def build_linkedin_post_text(post_data: Dict) -> str:
    """Build the final LinkedIn post text from structured fields."""
    parts = []

    for field in ("hook", "body", "closing"):
        value = (post_data.get(field) or "").strip()
        if value:
            parts.append(value)

    hashtags = [tag.strip() for tag in post_data.get("hashtags", []) if tag.strip()]
    if hashtags:
        parts.append(" ".join(hashtags[:5]))

    return "\n\n".join(parts)


def build_instagram_post_text(post_data: Dict) -> str:
    """Build the final Instagram caption text from structured fields."""
    caption = (post_data.get("caption") or "").strip()
    hashtags = [tag.strip() for tag in post_data.get("hashtags", []) if tag.strip()]

    parts = []
    if caption:
        parts.append(caption)
    if hashtags:
        parts.append(" ".join(hashtags))

    return "\n\n".join(parts)


def extract_generated_post_image_urls(post_data: Dict) -> List[str]:
    """Extract image URLs from in-memory generated post data before normalization."""
    urls = []

    for image in post_data.get("images", []) or []:
        url = str(image.get("url") or "").strip()
        if url and url not in urls:
            urls.append(url)

    single_image = post_data.get("image") or {}
    url = str(single_image.get("url") or "").strip()
    if url and url not in urls:
        urls.append(url)

    return urls


def get_post_image_urls(post_data: Dict) -> List[str]:
    """Return image URLs from the simplified persisted post shape."""
    urls = []
    for image in post_data.get("images", []) or []:
        url = str(image.get("url") or "").strip()
        if url and url not in urls:
            urls.append(url)
    return urls


def normalize_platform_post(
    *,
    platform: str,
    scope: str,
    date: str,
    period_start: str,
    period_end: str,
    generated_at: str,
    raw_post: Dict,
) -> Dict:
    """Normalize a generated platform post to the minimal persisted envelope."""
    text = ""
    title = ""
    metadata = {}

    if platform == "twitter":
        text = (raw_post.get("tweet") or "").strip()
    elif platform == "linkedin":
        text = (raw_post.get("full_post") or build_linkedin_post_text(raw_post)).strip()
    elif platform == "instagram":
        text = build_instagram_post_text(raw_post)
        metadata["post_type"] = (
            "carousel" if len(extract_generated_post_image_urls(raw_post)) > 1 else "post"
        )
    elif platform == "reddit":
        title = (raw_post.get("title") or "").strip()
        text = (raw_post.get("body") or raw_post.get("text") or "").strip()
    elif platform == "discord":
        text = (raw_post.get("message") or "").strip()
    else:
        text = (raw_post.get("text") or "").strip()
        title = (raw_post.get("title") or "").strip()

    result = {
        "platform": platform,
        "scope": scope,
        "date": date,
        "period_start": period_start,
        "period_end": period_end,
        "generated_at": generated_at,
        "images": [{"url": url} for url in extract_generated_post_image_urls(raw_post)],
    }

    if title:
        result["title"] = title
    if text:
        result["text"] = text
    if metadata:
        result["metadata"] = metadata

    return result


def join_summary_parts(parts: List[str]) -> str:
    """Join non-empty summary sections without repeating the same sentence twice."""
    unique_parts = []
    seen = set()
    for part in parts:
        text = (part or "").strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        unique_parts.append(text)
    return "\n\n".join(unique_parts)


def build_canonical_summary(
    *,
    date: str,
    period_start: str,
    period_end: str,
    title: str,
    summary: str,
    prs: List[Dict],
    generated_at: str,
) -> Dict:
    """Build the minimal persisted summary shape shared by daily and weekly."""
    canonical_prs = []
    seen = set()

    for pr in prs:
        try:
            number = int(pr.get("number"))
        except (TypeError, ValueError):
            continue
        pr_date = str(pr.get("date") or "").strip()
        if not pr_date:
            continue
        key = (number, pr_date)
        if key in seen:
            continue
        seen.add(key)
        canonical_prs.append({"number": number, "date": pr_date})

    canonical_prs.sort(key=lambda item: (item["date"], item["number"]))

    result = {
        "date": date,
        "period_start": period_start,
        "period_end": period_end,
        "title": title.strip(),
        "summary": summary.strip(),
        "pr_count": len(canonical_prs),
        "prs": canonical_prs,
        "generated_at": generated_at,
    }

    return result


def build_daily_summary_artifact(
    summary: Dict, gists: List[Dict], date_str: str, generated_at: str
) -> Dict:
    """Build the canonical daily summary stored on the news branch."""
    arcs = summary.get("arcs") or []
    one_liner = (summary.get("one_liner") or "").strip()
    headline = next(
        ((arc.get("headline") or "").strip() for arc in arcs if (arc.get("headline") or "").strip()),
        "",
    )
    title = headline or one_liner or f"Updates for {date_str}"
    arc_summaries = [
        (arc.get("summary") or "").strip()
        for arc in arcs[:3]
        if (arc.get("summary") or "").strip()
    ]
    summary_text = join_summary_parts(
        ([one_liner] if one_liner and one_liner != title else []) + arc_summaries
    )
    if not summary_text:
        summary_text = one_liner or title

    prs = [{"number": gist.get("pr_number"), "date": date_str} for gist in gists]
    artifact = build_canonical_summary(
        date=date_str,
        period_start=date_str,
        period_end=date_str,
        title=title,
        summary=summary_text,
        prs=prs,
        generated_at=generated_at,
    )
    # Shown directly on Enter's News page and in the README via index.json.
    artifact["highlights"] = [
        item for item in summary.get("highlights") or []
        if isinstance(item, dict) and item.get("title") and item.get("text")
    ]
    return artifact


def get_week_dates(override_start: Optional[str] = None):
    """Return (week_start, week_end, publish_date) as YYYY-MM-DD strings.
    Coverage stays Sun→Sat, but weekly artifacts are keyed by the Sunday publish date.
    When run by cron on Sunday 06:00 UTC:
      - week_start = today-7 (last Sunday)
      - week_end = today-1 (Saturday)
      - publish_date = today (Sunday)
    """
    if override_start:
        start = datetime.strptime(override_start, "%Y-%m-%d").date()
    else:
        today = datetime.now(timezone.utc).date()
        start = today - timedelta(days=7)

    end = start + timedelta(days=6)  # Saturday
    publish_date = end + timedelta(days=1)  # Sunday
    return (
        start.strftime("%Y-%m-%d"),
        end.strftime("%Y-%m-%d"),
        publish_date.strftime("%Y-%m-%d"),
    )


def build_weekly_summary_artifact(
    digest: Dict,
    gists: List[Dict],
    publish_date: str,
    week_start: str,
    week_end: str,
    generated_at: str,
) -> Dict:
    """Build the canonical weekly summary stored on the news branch."""
    arcs = digest.get("arcs") or []
    theme = (digest.get("theme") or "").strip()
    headline = next(
        ((arc.get("headline") or "").strip() for arc in arcs if (arc.get("headline") or "").strip()),
        "",
    )
    title = headline or theme or f"Week ending {week_end}"
    arc_summaries = [
        (arc.get("summary") or "").strip()
        for arc in arcs[:4]
        if (arc.get("summary") or "").strip()
    ]
    summary_text = join_summary_parts(
        ([theme] if theme and theme != title else []) + arc_summaries
    )
    if not summary_text:
        summary_text = theme or title

    prs = [
        {"number": gist.get("pr_number"), "date": (gist.get("merged_at") or "")[:10]}
        for gist in gists
    ]

    return build_canonical_summary(
        date=publish_date,
        period_start=week_start,
        period_end=week_end,
        title=title,
        summary=summary_text,
        prs=prs,
        generated_at=generated_at,
    )


def month_dates(month: str) -> tuple[str, str]:
    year, month_number = (int(part) for part in month.split("-"))
    final_day = calendar.monthrange(year, month_number)[1]
    return f"{month}-01", f"{month}-{final_day:02d}"


def read_daily_summaries(month: str, repo_root: Optional[str] = None) -> List[Dict]:
    """Read valid canonical daily summaries for a calendar month."""
    root = Path(repo_root or get_repo_root())
    daily_root = root / DAILY_REL_DIR
    summaries = []
    for path in sorted(daily_root.glob(f"{month}-*/summary.json")):
        try:
            summary = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as error:
            print(f"  Warning: skipping malformed daily summary {path}: {error}")
            continue
        if str(summary.get("date") or "").startswith(month):
            summaries.append(summary)
    return summaries


def monthly_digest_input(daily_summaries: List[Dict], month: str) -> str:
    """The monthly digest call's user message: the month's daily summaries."""
    context = [
        {
            "date": summary.get("date"),
            "title": summary.get("title"),
            "summary": summary.get("summary"),
            "pr_count": summary.get("pr_count", 0),
        }
        for summary in daily_summaries
    ]
    pr_count = sum(int(summary.get("pr_count") or 0) for summary in daily_summaries)
    return (
        f"Month: {month}\n"
        f"PRs selected for daily recaps: {pr_count}\n"
        f"Active days: {len(daily_summaries)}\n\n"
        f"Canonical daily summaries:\n{json.dumps(context, indent=2, ensure_ascii=False)}"
    )


def build_monthly_summary_artifact(
    digest: Dict,
    daily_summaries: List[Dict],
    month: str,
    generated_at: str,
) -> Dict:
    """Build the canonical summary stored in the monthly news archive."""
    period_start, period_end = month_dates(month)
    arcs = digest.get("arcs") or []
    theme = str(digest.get("theme") or "").strip()
    headline = next(
        (
            str(arc.get("headline") or "").strip()
            for arc in arcs
            if str(arc.get("headline") or "").strip()
        ),
        "",
    )
    title = headline or theme or datetime.strptime(month, "%Y-%m").strftime("%B %Y")
    arc_summaries = [
        str(arc.get("summary") or "").strip()
        for arc in arcs[:4]
        if str(arc.get("summary") or "").strip()
    ]
    summary_text = join_summary_parts(
        ([theme] if theme and theme != title else []) + arc_summaries
    )

    prs = []
    for daily in daily_summaries:
        prs.extend(daily.get("prs") or [])

    return build_canonical_summary(
        date=period_end,
        period_start=period_start,
        period_end=period_end,
        title=title,
        summary=summary_text or theme or title,
        prs=prs,
        generated_at=generated_at,
    )


def commit_files_to_branch(
    files: List[tuple],
    branch: str,
    github_token: str,
    owner: str,
    repo: str,
    label: str = "",
) -> bool:
    """Commit JSON files to a branch. Returns False if any file failed.

    Args:
        files: list of (file_path, data_dict) tuples
        label: suffix for commit messages, e.g. "for 2026-02-12"
    """
    import base64 as _b64

    headers = _github_headers(github_token)

    ok = True
    for file_path, data in files:
        if data is None:
            continue
        content = data if isinstance(data, str) else json.dumps(data, indent=2, ensure_ascii=False)
        encoded = _b64.b64encode(content.encode()).decode()

        sha = get_file_sha(github_token, owner, repo, file_path, branch)
        if not sha and branch != GISTS_BRANCH:
            sha = get_file_sha(github_token, owner, repo, file_path, "main")

        msg = f"news: add {file_path.split('/')[-1]}"
        if label:
            msg += f" {label}"

        payload = {
            "message": msg,
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
            print(f"  Committed {file_path}")
        else:
            print(f"  Error committing {file_path}: {resp.status_code} {resp.text[:200]}")
            ok = False
    return ok


# ── Model post ───────────────────────────────────────────────────────

CATEGORIES: tuple[str, ...] = ("text", "image", "video", "audio", "embeddings")


@dataclass(frozen=True)
class Diff:
    added: dict[str, list[dict[str, Any]]]
    removed: dict[str, list[dict[str, Any]]]
    changed: dict[str, list[dict[str, Any]]]

    def is_empty(self) -> bool:
        return not any(
            self.added[c] or self.removed[c] or self.changed[c] for c in CATEGORIES
        )

    def to_json(self) -> dict[str, Any]:
        return {"added": self.added, "removed": self.removed, "changed": self.changed}


def fetch_all_snapshots() -> dict[str, list[dict[str, Any]]]:
    """GET /models returns every model in one call with a 'category' field.
    We bucket by that field into the known categories.

    No auth — authenticated requests filter by key permissions, which would
    create false 'removed' entries when keys differ between runs."""
    url = f"{GEN_BASE}/models"
    resp = requests.get(url, headers={"Accept": "application/json"}, timeout=30)
    resp.raise_for_status()
    payload = resp.json()
    # /v1/models wraps in {data:[...]}; /models returns a bare list.
    all_models: list[dict[str, Any]] = (
        list(payload["data"])
        if isinstance(payload, dict) and "data" in payload
        else list(payload)
        if isinstance(payload, list)
        else []
    )
    if not all_models:
        raise ValueError(f"Unexpected or empty response from {url}: {payload!r:.200}")

    result: dict[str, list[dict[str, Any]]] = {cat: [] for cat in CATEGORIES}
    unknown: list[str] = []
    for model in all_models:
        cat = model.get("category", "")
        # API returns "embedding" (singular); we bucket under "embeddings"
        if cat == "embedding":
            cat = "embeddings"
        if cat in result:
            result[cat].append(model)
        else:
            unknown.append(f"{model.get('name', '?')}({cat})")
    if unknown:
        print(f"  Warning: unrecognised categories, skipped: {unknown[:10]}")
    return result


# Fields ignored when comparing models.
# description: prose edits with no capability change.
# added_date: static timestamp, never changes for existing models.
# name / id: identity key fields used for lookup — excluded from value comparison
#   so that snapshots migrating from 'id' to 'name' don't flood the diff.
_DIFF_IGNORED_FIELDS: frozenset[str] = frozenset(
    {"description", "added_date", "name", "id"}
)


def _normalize_for_diff(model: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for k, v in model.items():
        if k in _DIFF_IGNORED_FIELDS:
            continue
        # Sort lists so reordering aliases/modalities/capabilities doesn't
        # trigger false "changed" entries.
        result[k] = sorted(str(x) for x in v) if isinstance(v, list) else v
    # Snapshots taken before the catalog always sent paid_only omit it for
    # models that were never paid-only; missing meant false. Remove once the
    # stored snapshot has been taken from a catalog that always sends it.
    result.setdefault("paid_only", False)
    return result


def _migrate_old_snapshot(
    snapshot: dict[str, list[dict[str, Any]]],
) -> dict[str, list[dict[str, Any]]]:
    """One-time migration: old snapshots stored image+video together under 'image'
    (fetched from /image/models before the video split). If 'video' is absent but
    'image' is present, re-bucket by each model's 'category' field so the diff
    doesn't report all video models as removed from image."""
    if "video" in snapshot or "image" not in snapshot:
        return snapshot
    migrated = {k: list(v) for k, v in snapshot.items()}
    migrated["image"] = [m for m in snapshot["image"] if m.get("category") != "video"]
    migrated["video"] = [m for m in snapshot["image"] if m.get("category") == "video"]
    video_count = len(migrated["video"])
    if video_count:
        print(f"  Migrated {video_count} video model(s) out of old 'image' bucket.")
    return migrated


def _model_key(m: dict[str, Any]) -> str | None:
    """Return a stable identity key for a model, falling back to 'id' for
    older snapshots that predate the 'name' field."""
    return m.get("name") or m.get("id")


def diff_models(
    previous: dict[str, list[dict[str, Any]]] | None,
    current: dict[str, list[dict[str, Any]]],
) -> Diff:
    added: dict[str, list[dict[str, Any]]] = {c: [] for c in CATEGORIES}
    removed: dict[str, list[dict[str, Any]]] = {c: [] for c in CATEGORIES}
    changed: dict[str, list[dict[str, Any]]] = {c: [] for c in CATEGORIES}

    if previous is None:
        # First run: treat the snapshot as baseline with no announced changes.
        return Diff(added=added, removed=removed, changed=changed)

    for cat in CATEGORIES:
        curr_raw = current.get(cat, [])
        curr_by_name = {_model_key(m): m for m in curr_raw if _model_key(m)}

        # Category absent from previous snapshot = newly tracked (e.g. 'video'
        # added after this code change). Treat as no baseline — don't flood the
        # diff by announcing every existing model as "added".
        if cat not in previous:
            print(
                f"  Info: '{cat}' not in previous snapshot — skipping (new category)."
            )
            continue

        prev_raw = previous[cat]
        prev_by_name = {_model_key(m): m for m in prev_raw if _model_key(m)}

        # Old snapshot has raw models but none resolved to a key — structural
        # mismatch (e.g. old format used a different field). Skip rather than
        # reporting every current model as "added".
        if prev_raw and not prev_by_name:
            print(
                f"  Warning: previous snapshot for '{cat}' has {len(prev_raw)} models "
                "but none have a resolvable key — skipping diff for this category."
            )
            continue

        for name, model in curr_by_name.items():
            if name not in prev_by_name:
                added[cat].append(model)
            elif _normalize_for_diff(prev_by_name[name]) != _normalize_for_diff(model):
                changed[cat].append({"before": prev_by_name[name], "after": model})

        for name, model in prev_by_name.items():
            if name not in curr_by_name:
                removed[cat].append(model)

    return Diff(added=added, removed=removed, changed=changed)


def models_report_input(
    diff: dict[str, Any], date_str: str, previous_date: str | None
) -> str:
    """The model post call's user message: the /models comparison."""
    return json.dumps(
        {
            "date": date_str,
            "previous_date": previous_date,
            "diff": diff,
        },
        indent=2,
        ensure_ascii=False,
    )


def discord_payload(
    discord_text: str,
    date_str: str,
    previous_date: str | None,
    role_id: str | None,
    generated_at: str,
) -> dict[str, Any]:
    text = discord_text
    if role_id:
        text = text.replace("<@&MODEL_ROLE_ID>", f"<@&{role_id}>")
    else:
        text = text.replace("<@&MODEL_ROLE_ID>", "").lstrip()
    return {
        "platform": "discord",
        "scope": "models_weekly",
        "date": date_str,
        "previous_date": previous_date,
        "generated_at": generated_at,
        "text": text,
    }


def models_md(existing_md: str, section: str) -> str:
    """models.md with the new section on top, under one changelog heading."""
    # Strip any existing top-level changelog heading so we don't accumulate
    # duplicates each week — the H1 is re-added below.
    body = existing_md.lstrip()
    if body.startswith("# Pollinations Model Changelog"):
        body = body.split("\n", 1)[1].lstrip() if "\n" in body else ""
    return (
        "# Pollinations Model Changelog\n\n"
        + section.rstrip()
        + ("\n\n" + body if body else "\n")
    )


# ── VPS deployment ───────────────────────────────────────────────────

def deploy_reddit_news_post(
    post_dir: str,
    github_token: str,
    owner: str,
    repo: str,
) -> Optional[bool]:
    """Deploy reddit.json when the shared VPS configuration is available."""
    vps_host = get_env("REDDIT_VPS_HOST", required=False)
    vps_user = get_env("REDDIT_VPS_USER", required=False)
    vps_ssh_key = (get_env("REDDIT_VPS_SSH_KEY", required=False) or "").strip()
    if not (vps_host and vps_user and vps_ssh_key):
        print("  Reddit VPS credentials not configured — skipping")
        return None

    import base64
    import io
    import paramiko

    private_key = base64.b64decode(vps_ssh_key).decode("utf-8")
    pkey = paramiko.Ed25519Key.from_private_key(io.StringIO(private_key))
    reddit_data = read_news_file(
        os.path.join(post_dir, "reddit.json"), github_token, owner, repo
    )
    if not reddit_data:
        print("  No reddit.json — skipping")
        return None

    print("  Reddit...")
    try:
        return deploy_reddit_post(reddit_data, vps_host, vps_user, pkey)
    except Exception:  # noqa: BLE001 - the old senders report it as before: False, and go on
        return False


def deploy_reddit_post(
    reddit_data: Dict,
    vps_host: str,
    vps_user: str,
    pkey,
) -> bool:
    import paramiko

    title = reddit_data.get("title", "")
    image_urls = get_post_image_urls(reddit_data)
    image_url = image_urls[0] if image_urls else ""

    if not all([title, image_url, vps_host, vps_user, pkey]):
        print("  VPS: Missing required arguments")
        return False

    deploying = False
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

        # Sanitize for unquoted heredoc (shell expansion active)
        # Also strip newlines to prevent breaking TypeScript syntax
        def _sanitize(s: str) -> str:
            return (s
                .replace('\n', ' ').replace('\r', '')
                .replace('LINKEOF', '')
                .replace('\\', '\\\\')
                .replace('"', '\\"')
                .replace('$', '\\$')
                .replace('`', '\\`'))

        sanitized_url = _sanitize(image_url)
        sanitized_title = _sanitize(title)

        update_link_cmd = f"""{base_cmd} && cat > src/link.ts << LINKEOF
const LINK = "{sanitized_url}";
const TITLE = "{sanitized_title}";
export {{LINK, TITLE}};
LINKEOF
"""

        print("  VPS: Updating link.ts...")
        _stdin, _stdout, stderr = ssh.exec_command(update_link_cmd)
        err = stderr.read().decode().strip()
        if err:
            print(f"  VPS: link.ts write warning: {err[:200]}")

        deploy_cmd = f"{base_cmd} && nohup bash ./bash/deploy.sh > deploy.log 2>&1 &"

        print("  VPS: Running deploy.sh...")
        deploying = True
        ssh.exec_command(deploy_cmd)  # fire-and-forget by design (nohup)
        ssh.close()

        print("  VPS: Deployment script triggered successfully")
        print("  VPS: Logs will be available at /root/reddit_post_automation/deploy.log")
        return True

    except Exception as e:
        print(f"  VPS: {type(e).__name__}: {e}")
        if deploying:
            raise  # deploy.sh may already run: the caller can't treat this as not sent
        return False
