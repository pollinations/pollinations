#!/usr/bin/env python3
"""
Instagram meme pipeline — dynamic, trend-driven.

Flow:
  1. gemini-search → structured trend intelligence brief (most critical step)
  2. AI creative director → viral image prompts (1-10) + caption + hashtags
  3. Returns instagram_post dict for rendering by generate_platform_images()

Image rendering happens in generate_daily / generate_weekly using gpt-image-2
with skip_style_suffix=True (no pixel art, no bee, no reference image).

FAIL LOUD: any step failure calls sys.exit(1). This is a customer-acquisition
pipeline — silent degradation is not acceptable.
"""

import sys
from typing import Dict, List, Optional

from common import call_pollinations_api, parse_json_response

MEME_IMAGE_MODEL = "gpt-image-2"
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
Do NOT invent formats — only report what you actually find in search results.
Do NOT default to formats you've heard of before unless your live search confirms they are
currently viral THIS WEEK. Report whatever your search actually surfaces, even if unfamiliar.

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
- Open-source AI generation platform for images, audio, text, and video
- API keys are required, but there are free tiers available — anyone can start building without paying
- Get an API key at https://enter.pollinations.ai
- 10M+ users, loved by developers, designers, and AI creatives
- Positioning: "the most accessible AI platform on the internet — generous free tier, no credit card to start"
- Tone: smart, playful, slightly irreverent — NOT corporate, NOT try-hard
- The audience follows for: AI art inspo, cool tech, creative tools, developer humor

IMPORTANT — avoid outdated claims: Pollinations used to have no API key requirement.
That is no longer true. Do NOT write copy saying "no API key", "no signup", or "completely free with
no account". The accurate story today is: free tier + API key required. Stay factually correct.

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

## PICKING FROM THE TREND BRIEF
The trend brief will list several viral formats. Do NOT always pick the first one or the most
famous one. Pick the format that genuinely fits TODAY's specific PR content best.
If today's updates are humor-friendly, a meme format may fit. If they're data/stat-driven,
a bold typography format may fit better. If they're visual-product launches, a visual showcase
format may fit. Your choice must be defensible from the specific PR data, not just "this is
the trendiest thing right now."

## THE ANTI-SLOP PRINCIPLE — read this twice
"AI slop" is not a repetition problem. It is a SPECIFICITY problem. The content that gets called
slop is generic: vague copy, glowing-brain AI imagery, corporate speak, moods that could apply
to any brand on any day. Duolingo, NASA, and Figma are extremely consistent post-to-post and
nobody calls them slop. The difference is craft and concrete specificity.

Your defense against slop is specificity, not variance:
- Every post MUST name at least one specific trend, meme format, or cultural moment from the brief
- Every post MUST anchor on at least one concrete PR detail (verbatim quote, specific number,
  specific feature name, specific model name)
- Anything vague enough to apply to any AI brand on any day = rejected. Redo until specific.

## FORMAT MIX — memes AND info, ratio decided per post
You have a menu of slide roles, NOT a fixed recipe:
- "meme_hook" — attention-grabbing meme, relatable humor, zero info yet. Job: stop the scroll.
- "info_payload" — the actual product update delivered as bold typography / infographic / data card.
  MUST have meme-level visual punch (big type, one insight per slide, zero bullet walls, zero
  corporate framing). An info slide that looks like a PowerPoint bullet is a failure.
- "meme_bridge" — meme that ties the hook to the info payload (thematic link).
- "cta" — final slide, meme-coded call to action (save / share / try it).
- "standalone" — used when post has only 1 image that does everything.

Rules on the mix:
- You decide per post: sometimes 100% memes (when the update is humor-friendly), sometimes
  100% info (when the update is a killer stat that speaks for itself), sometimes mixed.
- If the PR data is substantive, at least ONE slide must be `info_payload` delivering the actual
  update. Memes alone without info = no conversion.
- No fixed alternation. No template. The order serves the specific content, not a pattern.
- Info slides and meme slides are both creative — same visual energy, same boldness. Info is
  not "the boring slide" — it's a different format for the same viral goal.

## IMAGE PROMPT ENGINEERING FOR gpt-image-2
The image renderer is gpt-image-2 — OpenAI's image model with strong text-rendering.
It is HIGHLY contextual and excellent at text-in-image. It understands meme formats,
visual culture, and design intent from natural language.

YOU decide all visual choices — colors, fonts, aesthetic, mood, style.
The trend brief is your creative law for what's visually working right now.

### Text-in-image rules (follow exactly)
- Always write in-image text VERBATIM inside double quotes in the prompt itself
- Keep each text element SHORT — 1-6 words renders crisply; 15+ words gets garbled
- State text HIERARCHY explicitly — declare which text is the headline and which is subtext
- Always specify readable contrast between text and background
- For meme formats with two text zones, specify each zone's text separately
- For info_payload slides: lead with the biggest insight (a number, a claim, a word) in large type
- Do NOT say "add relevant text" — vague text directives produce garbled output
- YOU write every text element. YOU decide the copy. YOU decide the visual style.

### What to specify vs let the model decide
SPECIFY:
  - The exact verbatim text content for every text element
  - Text placement and layout structure
  - Format name if it's a recognizable meme template
  - Which specific trend-brief reference this slide exploits

DECIDE FREELY (no repeats across carousel slides, same vibe across one carousel):
  - Colors, palette, background style
  - Font weight and personality
  - Mood and atmosphere
  - Visual aesthetic and rendering style

### Carousel visual coherence
If creating multiple images, describe a shared visual thread (color family, layout grid, font
personality) at the start of each slide's prompt so the carousel reads as one post — even when
slide roles alternate between meme and info.

## DECISION FRAMEWORK: how many images?
- 1 image: when a single visual does everything (killer meme OR killer infographic)
- 2-4 images: most common — hook + payload + optional bridge + optional cta
- 5-10 images: only for listicle carousels where each slide = 1 concrete item
- More images ≠ more reach. Every slide must earn its place.

## WHAT NEVER TO DO
- No pixel art, no bee mascot, no cartoon characters
- No corporate speak ("we're excited to announce", "proud to share", "game-changing")
- No generic AI stock imagery (glowing brains, robot hands, circuit boards)
- No text-heavy slides with small font — text in images must be LARGE and readable
- No bullet-point infographics that look like corporate slides
- No vague moods that could describe any brand — specificity is non-negotiable

## OUTPUT FORMAT
Respond ONLY with valid JSON. No markdown, no code fences, no text outside the JSON:
{
  "image_count": <int 1-10>,
  "slides": [
    {
      "slide_role": "meme_hook" | "info_payload" | "meme_bridge" | "cta" | "standalone",
      "prompt": "<COMPLETE image prompt — format, verbatim text, layout, mood, palette>",
      "specificity_anchors": {
        "trend_reference": "<named trend/format/moment from the brief this slide exploits>",
        "pr_detail": "<specific PR feature/number/quote this slide anchors on, or 'none' for pure-meme hook slides>"
      }
    },
    ...
  ],
  "caption": "<hook line\\n\\nbody\\n\\nCTA>",
  "hashtags": ["#tag1", "#tag2", ...],
  "post_angle": "<one sentence: what makes this shareable>",
  "creative_rationale": "<2-3 sentences: which specific trend this exploits, why this slide mix fits this specific PR data, why it will perform>"
}

IMPORTANT:
- caption must NOT contain hashtags — hashtags go only in the hashtags array
- Every slide must have non-vague specificity_anchors; if you can't name a specific trend + PR
  detail, your slide isn't specific enough — rewrite it
- If the post has substantive PR content and no slide has slide_role "info_payload" or "standalone",
  your slide mix is wrong — you must deliver the info"""

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

    # New schema: slides = [{slide_role, prompt, specificity_anchors}]
    # Fall back to legacy image_prompts: [string] if the model regresses.
    raw_slides = brief.get("slides")
    if isinstance(raw_slides, list) and raw_slides:
        slides = []
        for s in raw_slides:
            if not isinstance(s, dict):
                continue
            prompt = s.get("prompt")
            if not isinstance(prompt, str) or not prompt.strip():
                continue
            slides.append({
                "prompt": prompt.strip(),
                "slide_role": s.get("slide_role", "standalone") or "standalone",
                "specificity_anchors": s.get("specificity_anchors") or {},
            })
    else:
        raw_prompts = brief.get("image_prompts") or []
        slides = [
            {"prompt": p.strip(), "slide_role": "standalone", "specificity_anchors": {}}
            for p in raw_prompts if isinstance(p, str) and p.strip()
        ]

    if not slides:
        print("  FATAL [meme]: creative director returned no valid slides")
        sys.exit(1)

    if not brief.get("caption"):
        print("  FATAL [meme]: creative director returned no caption")
        sys.exit(1)

    # Clamp slide count to 1-10; be defensive on non-integer LLM output
    try:
        image_count = min(max(1, int(brief.get("image_count", len(slides)))), 10)
    except (ValueError, TypeError):
        image_count = min(len(slides), 10)

    slides = slides[:image_count]

    # Enforce: if the post has substantive content, at least one slide must deliver it
    payload_roles = {"info_payload", "standalone"}
    if len(slides) > 1 and not any(s["slide_role"] in payload_roles for s in slides):
        print("  FATAL [meme]: multi-slide post with no info_payload/standalone slide — refusing to post memes without the actual update")
        sys.exit(1)

    brief["slides"] = slides
    brief["image_count"] = len(slides)

    roles = [s["slide_role"] for s in slides]
    angle = brief.get("post_angle", "")
    rationale = (brief.get("creative_rationale") or "")[:150]
    print(f"  [meme] {brief['image_count']} slide(s) | roles: {roles}")
    print(f"  [meme] angle: {angle}")
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
        which renders via gpt-image-2 + skip_style_suffix=True.

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

    images = [
        {
            "prompt": s["prompt"],
            "slide_role": s["slide_role"],
            "specificity_anchors": s["specificity_anchors"],
        }
        for s in brief["slides"]
    ]

    return {
        "caption": caption,
        "hashtags": hashtags,
        "images": images,
        "_trend_brief_preview": trend_brief[:400],
        "_creative_rationale": brief.get("creative_rationale", ""),
        "_post_angle": brief.get("post_angle", ""),
    }
