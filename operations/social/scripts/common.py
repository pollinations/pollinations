#!/usr/bin/env python3
"""
Common utilities for social media post generators.
Shared code for LinkedIn, Twitter, and other platforms.
"""

import os
import sys
import json
import calendar
import random
import requests
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

# Limits
MAX_SEED = 2147483647
DEFAULT_TIMEOUT = 30  # seconds for GitHub API / general requests
LINKEDIN_MAX_CHARS = 1248

# Repository constants
OWNER = "pollinations"
REPO = "pollinations"
NEWS_BRANCH = "news"  # Unprotected branch for news data (avoids main branch protection)
NEWS_REL_DIR = "operations/social/news"
# What we keep and read back: the summaries, the /models record, the monthly
# contributor counts and Enter's index.
DATA_REL_DIR = f"{NEWS_REL_DIR}/data"
SUMMARIES_REL_DIR = f"{DATA_REL_DIR}/summaries"
MODELS_NEWS_DIR = f"{DATA_REL_DIR}/models"
CONTRIBUTORS_REL_DIR = f"{DATA_REL_DIR}/contributors"
# What each platform received: posts/<platform>/<job>/<date>.json, with the
# folder's delivery.json next to them.
POSTS_REL_DIR = f"{NEWS_REL_DIR}/posts"


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
    **kwargs,
) -> requests.Response:
    """One GitHub API request; callers check its status, and a failure stops the run."""
    return requests.request(method, url, headers=headers, timeout=timeout or DEFAULT_TIMEOUT, **kwargs)


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
        name: 'posts/x/tone', 'summaries/pr', etc.

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


def call_pollinations_api(
    system_prompt: str,
    user_prompt: str,
    token: str,
    temperature: float = 0.7,
    response_format: Optional[Dict] = None,
) -> Optional[str]:
    """One model call. None when it fails or the answer is empty: the caller stops the run."""
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
    try:
        response = requests.post(
            POLLINATIONS_API_BASE,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=payload,
            timeout=120
        )
    except requests.exceptions.RequestException as e:
        print(f"  Request failed: {e}")
        return None
    if response.status_code != 200:
        print(f"  API error: {response.status_code}")
        print(f"  Error preview: {response.text[:500]}")
        return None
    try:
        result = response.json()
        content = result['choices'][0]['message']['content']
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        print(f"  Error parsing API response: {e}")
        print(f"  Response preview: {response.text[:500]}")
        return None
    print(
        f"  Text response: cache={response.headers.get('X-Cache', 'unknown')}, "
        f"finish_reason={result['choices'][0].get('finish_reason')}, chars={len(content or '')}"
    )
    return content if content and content.strip() else None


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

    seed = random.randint(0, MAX_SEED)
    print(f"  Using seed: {seed}")
    params = {
        "model": use_model,
        "width": width,
        "height": height,
        "quality": "hd",
        "seed": seed,
        "key": token,
        "image": "https://raw.githubusercontent.com/pollinations/pollinations/main/operations/social/prompts/brand/characters-ref.jpg",
    }
    # One attempt: a failed picture stops the run, and a person reruns it.
    try:
        response = requests.get(base_url, params=params, timeout=300)
    except requests.exceptions.RequestException as e:
        print(f"  Request error: {e}")
        return None, None
    content_type = response.headers.get('content-type', '')
    image_bytes = response.content
    is_jpeg = image_bytes[:2] == b'\xff\xd8'
    is_png = image_bytes[:8] == b'\x89PNG\r\n\x1a\n'
    is_webp = image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP'
    if response.status_code != 200:
        print(f"  HTTP error: {response.status_code}")
        return None, None
    if 'image' not in content_type:
        print(f"  Unexpected content type: {content_type}")
        return None, None
    if len(image_bytes) < 1000:
        print(f"  Image too small ({len(image_bytes)} bytes)")
        return None, None
    if not (is_jpeg or is_png or is_webp):
        print("  Invalid image format")
        return None, None

    # The image service keeps the picture for 30 days: posts save its link, never the file.
    media = response.links.get("enclosure", {}).get("url")
    if not media:
        print("  No media link in the response")
        return None, None
    img_format = "JPEG" if is_jpeg else ("PNG" if is_png else "WebP")
    print(f"  Image generated successfully ({img_format}, {len(image_bytes):,} bytes): {media}")
    return image_bytes, media


def _github_headers(token: str) -> Dict:
    """Standard GitHub API headers."""
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
    }


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


# ── Merged PR notes, read during the daily ─────────────────────────────

def pr_context(note: Dict) -> Dict:
    """The facts the daily summary reads about one merged PR."""
    return {key: note.get(key) for key in (
        "pr_number", "title", "author", "url", "area", "type", "source", "app_name", "app_url",
        "summary", "category", "importance", "user_facing", "keywords",
    )}


def daily_summary_input(notes: List[Dict], date_str: str) -> str:
    """The daily summary call's user message: the day's selected PRs."""
    return f"""Date: {date_str}
Number of PRs: {len(notes)}

PRs:
{chr(10).join(json.dumps(pr_context(note), indent=2) for note in notes)}"""


def weekly_digest_input(daily_summaries: List[Dict], week_start: str, week_end: str) -> str:
    """The weekly digest call's user message: the week's daily summaries and their daily items."""
    context = [
        {
            "date": summary.get("date"),
            "title": summary.get("title"),
            "summary": summary.get("summary"),
            "daily": [
                {"title": item.get("title"), "text": item.get("text")}
                for item in summary.get("daily") or []
            ],
            "pr_count": summary.get("pr_count", 0),
        }
        for summary in daily_summaries
    ]
    pr_count = sum(int(summary.get("pr_count") or 0) for summary in daily_summaries)
    return (
        f"Week: {week_start} to {week_end}\n"
        f"PRs selected for daily recaps: {pr_count}\n"
        f"Active days: {len(daily_summaries)}\n\n"
        f"Daily summaries:\n{json.dumps(context, indent=2, ensure_ascii=False)}"
    )


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


def generated_post_images(post_data: Dict) -> List[Dict]:
    """A generated post's picture links."""
    images = []
    for image in [*(post_data.get("images") or []), post_data.get("image") or {}]:
        url = str(image.get("url") or "").strip()
        if url and url not in [known["url"] for known in images]:
            images.append({"url": url})
    return images


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

    if platform == "x":
        text = (raw_post.get("tweet") or "").strip()
    elif platform == "linkedin":
        text = (raw_post.get("full_post") or build_linkedin_post_text(raw_post)).strip()
    elif platform == "instagram":
        text = build_instagram_post_text(raw_post)
        metadata["post_type"] = (
            "carousel" if len(generated_post_images(raw_post)) > 1 else "post"
        )
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
        "images": generated_post_images(raw_post),
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
    summary: Dict, notes: List[Dict], date_str: str, generated_at: str
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

    prs = [{"number": note.get("pr_number"), "date": date_str} for note in notes]
    artifact = build_canonical_summary(
        date=date_str,
        period_start=date_str,
        period_end=date_str,
        title=title,
        summary=summary_text,
        prs=prs,
        generated_at=generated_at,
    )
    # Shown directly on Enter's News page via index.json.
    artifact["daily"] = [
        item for item in summary.get("daily") or []
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
    daily_summaries: List[Dict],
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

    prs = [pr for daily in daily_summaries for pr in daily.get("prs") or []]

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


def read_daily_summaries(start: str, end: str, news_root: Path) -> List[Dict]:
    """The daily summaries from start to end that have a text; a day that only
    records Enter's changelog has none."""
    summaries = []
    day = datetime.strptime(start, "%Y-%m-%d")
    while day <= datetime.strptime(end, "%Y-%m-%d"):
        path = news_root / SUMMARIES_REL_DIR / "daily" / f"{day:%Y-%m-%d}.json"
        if path.exists():
            summary = json.loads(path.read_text(encoding="utf-8"))
            if summary.get("summary"):
                summaries.append(summary)
        day += timedelta(days=1)
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
        if not sha and branch != NEWS_BRANCH:
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

CATEGORIES: tuple[str, ...] = (
    "text", "image", "video", "audio", "embeddings", "3d", "realtime", "decision"
)


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


def fetch_all_snapshots(
    params: Optional[Dict[str, str]] = None,
) -> dict[str, list[dict[str, Any]]]:
    """GET /models returns every model in one call with a 'category' field.
    We bucket by that field into the known categories. params narrow the catalog.

    No auth — authenticated requests filter by key permissions, which would
    create false 'removed' entries when keys differ between runs."""
    url = f"{GEN_BASE}/models"
    resp = requests.get(
        url, params=params, headers={"Accept": "application/json"}, timeout=30
    )
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
# health: live request stats that change every minute, not model news.
# name / id: identity key fields used for lookup — excluded from value comparison
#   so that snapshots migrating from 'id' to 'name' don't flood the diff.
_DIFF_IGNORED_FIELDS: frozenset[str] = frozenset(
    {"description", "added_date", "health", "name", "id"}
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

    # Models are matched across categories: one that moved category changed.
    prev_all = {
        _model_key(m): m for ms in previous.values() for m in ms if _model_key(m)
    }
    curr_all = {
        _model_key(m): m for ms in current.values() for m in ms if _model_key(m)
    }

    for cat in CATEGORIES:
        curr_raw = current.get(cat, [])
        curr_by_name = {_model_key(m): m for m in curr_raw if _model_key(m)}

        # Category absent from previous snapshot = newly tracked (e.g. '3d'
        # added after this code change). Treat as no baseline — don't flood the
        # diff by announcing every existing model as "added" — unless it was
        # split off a recorded category (e.g. 'decision' out of 'text').
        if cat not in previous and not curr_by_name.keys() & prev_all.keys():
            print(
                f"  Info: '{cat}' not in previous snapshot — skipping (new category)."
            )
            continue

        prev_raw = previous.get(cat, [])
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
            if name not in prev_all:
                added[cat].append(model)
            elif _normalize_for_diff(prev_all[name]) != _normalize_for_diff(model):
                changed[cat].append({"before": prev_all[name], "after": model})

        for name, model in prev_by_name.items():
            if name not in curr_all:
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
    scope: str,
) -> dict[str, Any]:
    text = discord_text
    if role_id:
        text = text.replace("<@&MODEL_ROLE_ID>", f"<@&{role_id}>")
    else:
        text = text.replace("<@&MODEL_ROLE_ID>", "").lstrip()
    return {
        "platform": "discord",
        "scope": scope,
        "date": date_str,
        "previous_date": previous_date,
        "generated_at": generated_at,
        "text": text,
    }
