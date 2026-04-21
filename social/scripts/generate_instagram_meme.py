#!/usr/bin/env python3
"""
Instagram meme pipeline — dynamic, trend-driven.

Flow:
  1. gemini-search → structured trend intelligence brief (most critical step)
  2. AI creative director → viral image prompts (1-10) + caption + hashtags
  3. Returns instagram_post dict for rendering by generate_platform_images()

Image rendering happens in generate_daily / generate_weekly using nanobanana-pro
with skip_style_suffix=True (no pixel art, no bee, no reference image).

FAIL LOUD: any step failure calls sys.exit(1). This is a customer-acquisition
pipeline — silent degradation is not acceptable.
"""

import sys
from typing import Dict, List, Optional

from common import call_pollinations_api, parse_json_response

MEME_IMAGE_MODEL = "nanobanana-pro"
_TREND_MODEL = "gemini-search"
_CREATIVE_MODEL = "gemini-large"

# ── Trend intelligence ─────────────────────────────────────────────────────────

_TREND_FETCH_SYSTEM = """\
You are a senior social media intelligence analyst specializing in Instagram growth strategy.
You have real-time web access. Your job is to produce a structured trend brief that a creative
director can use RIGHT NOW to make a viral Instagram post.

Your output must be specific and actionable — no generic advice, no timeless tips.
Only report what is ACTUALLY trending THIS WEEK on Instagram based on your search results.

Structure your brief with these exact sections:

## VIRAL FORMATS (right now)
List 3-5 specific post formats/meme templates going viral this week on Instagram feed posts.
Include: the format name, what it looks like visually, example text patterns, and WHY it's working.
Examples of what this means: "Alphabet lore memes", "POV: you work at X", "brain rot humor",
"corporate to real translation", "nobody vs me" format, "day in my life aesthetic", etc.

## HOT TOPICS & CULTURAL MOMENTS
List 3-5 topics, events, or cultural conversations blowing up on Instagram right now.
These are the hooks that get the algorithm to push content — trending sounds, viral moments,
memes tied to news, etc. What are people actually talking about?

## VISUAL STYLES WINNING RIGHT NOW
What aesthetic is crushing it this week? What does top-performing feed content LOOK like visually?
Be specific: describe the aesthetic, not just name it.

## WHAT AI/TECH BRANDS ARE DOING THAT WORKS
How are AI tools, dev tools, and tech brands showing up virally on Instagram RIGHT NOW?
Any specific accounts, post styles, or angles getting massive engagement?

## ENGAGEMENT MECHANICS WORKING NOW
What is the Instagram algorithm currently rewarding? Saves? Carousels? Shares?
What caption hooks are stopping the scroll? What CTAs are driving saves vs shares?
How many hashtags are optimal right now? Which hashtag tiers work?

## AVOID LIST
What formats, topics, or styles are currently flopping or oversaturated on Instagram?
What should be avoided completely right now?"""

_TREND_QUERY = """\
Search Instagram, social media news sites, and marketing blogs for the LATEST information on:

1. What Instagram feed post formats and meme templates are going viral RIGHT NOW this week?
   Search: "Instagram trending memes 2025", "viral Instagram posts this week", \
"Instagram feed post trends"

2. What topics and cultural moments are dominating Instagram engagement right now?
   Search: "Instagram trending topics today", "what's going viral on Instagram"

3. What visual aesthetics are top-performing on Instagram feeds right now?
   Search: "Instagram aesthetic trends 2025", "best performing Instagram post style"

4. How are AI tools and tech brands going viral on Instagram right now?
   Search: "AI brand Instagram strategy 2025", "tech startup Instagram viral", \
"AI meme Instagram trending"

5. What does Instagram's algorithm reward right now? Saves, shares, carousels?
   Search: "Instagram algorithm 2025 what works", "Instagram engagement strategy 2025"

Use your search results to fill in each section of your brief. Be SPECIFIC with examples.
If you find a specific viral meme template or format, name it and describe it in detail.
If you find specific hashtag data, include it. Real data only — no guessing."""

# ── Creative director ──────────────────────────────────────────────────────────

_CREATIVE_DIRECTOR_SYSTEM = """\
You are a senior creative director and Instagram growth strategist who has grown tech brand \
accounts from 0 to 100k+ followers. You specialize in making AI and developer tools go viral \
on Instagram.

## THE BRAND: Pollinations.ai
- Free, open-source AI generation platform — no signup required, no API key needed
- Generates images, audio, text, video via simple API calls
- 10M+ users, loved by developers, designers, and AI creatives
- Positioning: "the most accessible AI platform on the internet"
- Tone: smart, playful, slightly irreverent — NOT corporate, NOT try-hard
- The audience follows for: AI art inspo, cool tech, creative tools, developer humor

## INSTAGRAM ALGORITHM (2025) — understand this before creating anything
- SAVES are the most powerful signal — content that gets saved gets pushed to non-followers
- SHARES to Stories/DMs drive discovery — shareability is required, not optional
- Carousels get a second algorithmic push to users who didn't complete the first time
- First slide of a carousel determines reach — if it doesn't hook, nobody swipes
- Feed posts compete with Reels for attention — bold visuals and text hooks are non-negotiable
- Hashtags: use 5-8 specific ones, mix of niche (50k-200k posts) + medium (200k-1M) + 1-2 broad
  Avoid: banned hashtags, overly generic ones (#art, #love, #photo), keyword stuffing

## CAPTION RULES (non-negotiable)
- First line is EVERYTHING — only ~125 chars show before "more" on mobile
- Hook patterns that work: bold claim, controversy, relatable pain, surprising stat, curiosity gap
- Body: conversational, like a smart friend texting — NOT a press release
- End with ONE clear CTA — "save this", "share with your developer friend", "which one would you use?"
- Do NOT put hashtags in the caption — they go ONLY in the hashtags array
- 150-300 words total max. Shorter is almost always better.

## IMAGE PROMPT ENGINEERING FOR nanobanana-pro
The image renderer is nanobanana-pro — Gemini 3 Pro Image with Thinking, 4K output.
It is HIGHLY contextual and excellent at text-in-image. It understands meme formats,
visual culture, and design intent from natural language.

YOU decide all visual choices — colors, fonts, aesthetic, mood, style.
Never repeat the same visual style twice. Make each post look completely different.
The trend brief tells you what's working visually right now — use that as your creative law.

### Text-in-image rules (most important — follow exactly)
- Always write in-image text VERBATIM in double quotes: "we just shipped voice cloning"
- Keep each text element SHORT — 1-6 words renders crisply; 15+ words gets garbled
- State text HIERARCHY explicitly: "Large headline: [text] / smaller subtext below: [text]"
- Always specify a readable contrast between text and background (you decide what looks good)
- For meme formats with two text zones (top/bottom or setup/punchline), specify each separately:
  "Top text: 'SENIOR DEVS' / Bottom text: 'me using pollinations free api'"
- Do NOT say "add relevant text" or "include a caption" — vague text = garbled output

### What to specify vs trust the model on
SPECIFY (model needs these):
  - The exact verbatim text content for every text element
  - Text placement (top, center, bottom, overlay, split-screen zones)
  - Layout structure (2-panel, 3-slide listicle, before/after split)
  - Format name if it's a recognizable meme template

DECIDE FREELY (your creative judgment, never repeat same choices):
  - Colors, palette, background style
  - Font weight and personality
  - Mood and atmosphere
  - Visual aesthetic and rendering style
  - Level of chaos vs minimalism

### Carousel visual coherence
If you create multiple images, describe a shared visual thread that ties them together
(same color family, same layout grid, same font personality) so the carousel reads as one post.
State this shared thread explicitly at the start of each slide's prompt.

### Prompt structure
"[Format/template]. [Scene/visual description]. [Text placement + verbatim content]. \
[Your chosen visual mood, palette, style]. [Carousel role if multi-image: hook / slide N of N / CTA]"

## DECISION FRAMEWORK: how many images?
- 1 image: when a single strong visual does everything (bold graphic, killer meme)
- 2-4 images: carousel when each slide delivers standalone value AND tells a story in sequence
- 5-10 images: only for listicle carousels where each slide = 1 item
- More images ≠ more reach. 1 scroll-stopping image beats 5 mediocre ones.

## WHAT NEVER TO DO
- No pixel art, no bee mascot, no cartoon characters
- No corporate speak ("we're excited to announce", "proud to share", "game-changing")
- No generic AI stock imagery (glowing brains, robot hands, circuit boards)
- No text-heavy slides with small font — text in images must be LARGE and readable
- Never sacrifice virality for informativeness — make it shareable first
- Never repeat a visual style from a previous post — each post must look completely different

## OUTPUT FORMAT
Respond ONLY with valid JSON. No markdown, no code fences, no text outside the JSON:
{
  "image_count": <int 1-10>,
  "image_prompts": [
    "<COMPLETE prompt for image 1>",
    ...
  ],
  "caption": "<hook line\\n\\nbody\\n\\nCTA>",
  "hashtags": ["#tag1", "#tag2", ...],
  "post_angle": "<one sentence: what makes this shareable>",
  "creative_rationale": "<2-3 sentences: which trend this exploits and why it will perform>"
}

IMPORTANT: The caption field must NOT contain hashtags — put all hashtags only in the hashtags array."""

# ── Pipeline functions ─────────────────────────────────────────────────────────

def fetch_instagram_trends(token: str) -> str:
    """Fetch structured trend brief via gemini-search. sys.exit(1) if brief is inadequate."""
    print("  [meme] Fetching live Instagram trend intelligence via gemini-search...")

    result = call_pollinations_api(
        system_prompt=_TREND_FETCH_SYSTEM,
        user_prompt=_TREND_QUERY,
        token=token,
        model=_TREND_MODEL,
        temperature=0.2,
        max_retries=3,
        exit_on_failure=False,
    )

    if not result or len(result.strip()) < 200:
        print("  FATAL [meme]: gemini-search returned insufficient trend data")
        sys.exit(1)

    # Both section markers must be present — either absent means the brief is unstructured
    if "##" not in result or "VIRAL FORMATS" not in result.upper():
        print("  FATAL [meme]: trend brief is unstructured — gemini-search may have failed or refused")
        sys.exit(1)

    print(f"  [meme] Trend brief received: {len(result)} chars")
    return result.strip()


def build_updates_context(data: Dict) -> str:
    """
    Build a concise text summary of product updates from summary or digest data.
    Returns empty string if data has no meaningful content — caller must handle this.
    """
    parts = []

    one_liner = data.get("one_liner") or data.get("week_summary", "")
    if one_liner:
        parts.append(f"Summary: {one_liner}")

    arcs = data.get("arcs", [])
    if arcs:
        arc_lines = []
        for arc in arcs[:5]:
            if not isinstance(arc, dict):
                continue
            headline = arc.get("headline") or arc.get("title", "")
            detail = arc.get("detail") or arc.get("summary", "")
            if headline:
                arc_lines.append(f"- {headline}: {detail}" if detail else f"- {headline}")
        if arc_lines:
            parts.append("Key updates:\n" + "\n".join(arc_lines))

    pr_summary = (data.get("pr_summary") or "").strip()
    if pr_summary:
        # Truncate long summaries rather than exclude them (weekly digests are longer)
        parts.append(f"Technical details: {pr_summary[:800]}")

    return "\n\n".join(parts)


def _generate_meme_brief(trend_brief: str, updates_context: str, token: str) -> Dict:
    """AI creative director generates viral brief. sys.exit(1) on any failure."""
    print("  [meme] Creative director generating viral brief...")

    user_prompt = (
        "## LIVE INSTAGRAM TREND INTELLIGENCE (freshly fetched via web search)\n\n"
        f"{trend_brief}\n\n"
        "---\n\n"
        "## POLLINATIONS.AI UPDATES TO PROMOTE\n\n"
        f"{updates_context}\n\n"
        "---\n\n"
        "Using the trend intelligence above as your creative brief, design a viral Instagram post "
        "for Pollinations.ai that will get maximum saves and shares. "
        "The trend brief is your law — exploit the specific formats and moments it identifies. "
        "Do NOT fall back to generic AI content. Make it feel native to what's trending right now.\n\n"
        "Output the JSON now."
    )

    result = call_pollinations_api(
        system_prompt=_CREATIVE_DIRECTOR_SYSTEM,
        user_prompt=user_prompt,
        token=token,
        model=_CREATIVE_MODEL,
        temperature=0.85,
        max_retries=3,
        exit_on_failure=False,
    )

    if not result:
        print("  FATAL [meme]: creative director returned no response")
        sys.exit(1)

    brief = parse_json_response(result)
    if not brief:
        print("  FATAL [meme]: creative director returned invalid JSON")
        print(f"  Raw response preview: {result[:500]}")
        sys.exit(1)

    # Validate and sanitize image_prompts — must be non-empty strings
    raw_prompts = brief.get("image_prompts") or []
    image_prompts = [p for p in raw_prompts if isinstance(p, str) and p.strip()]
    if not image_prompts:
        print("  FATAL [meme]: creative director returned no valid image prompts")
        sys.exit(1)

    if not brief.get("caption"):
        print("  FATAL [meme]: creative director returned no caption")
        sys.exit(1)

    # Clamp image count to 1-10; be defensive on non-integer LLM output
    try:
        image_count = min(max(1, int(brief.get("image_count", len(image_prompts)))), 10)
    except (ValueError, TypeError):
        image_count = min(len(image_prompts), 10)

    brief["image_prompts"] = image_prompts[:image_count]
    brief["image_count"] = len(brief["image_prompts"])

    angle = brief.get("post_angle", "")
    rationale = (brief.get("creative_rationale") or "")[:150]
    print(f"  [meme] {brief['image_count']} image(s) | angle: {angle}")
    print(f"  [meme] rationale: {rationale}")

    return brief


def generate_instagram_meme_post(data: Dict, token: str) -> Dict:
    """
    Full meme content pipeline.

    Args:
        data: summary dict (daily) or digest dict (weekly) — needs arcs / one_liner
        token: pollinations.ai API token

    Returns:
        instagram_post dict: {caption, hashtags, images: [{prompt}]}
        Images have only prompts here; URLs are added by generate_platform_images()
        which renders via nanobanana-pro + skip_style_suffix=True.

    sys.exit(1) on any failure — never silently degrades.
    """
    trend_brief = fetch_instagram_trends(token)

    updates_context = build_updates_context(data)
    if not updates_context:
        print("  FATAL [meme]: no product updates found — refusing to generate a post with no content")
        sys.exit(1)
    print(f"  [meme] Updates context: {len(updates_context)} chars")

    brief = _generate_meme_brief(trend_brief, updates_context, token)

    caption = brief["caption"].strip()

    # Sanitize hashtags: enforce # prefix, cap at 30 (Instagram limit)
    raw_tags = brief.get("hashtags") or []
    hashtags = [t if t.startswith("#") else f"#{t}" for t in raw_tags if isinstance(t, str) and t.strip()]
    hashtags = hashtags[:30]

    images = [{"prompt": p} for p in brief["image_prompts"]]

    return {
        "caption": caption,
        "hashtags": hashtags,
        "images": images,
        "_trend_brief_preview": trend_brief[:400],
        "_creative_rationale": brief.get("creative_rationale", ""),
        "_post_angle": brief.get("post_angle", ""),
    }
