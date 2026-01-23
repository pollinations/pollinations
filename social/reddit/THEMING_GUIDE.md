# Reddit Post System Prompt Guide

## Overview

The system prompt drives both image generation and post title creation for Reddit. It establishes a unified voice and visual direction, ensuring all content aligns with Pollinations' open-source, community-first identity and Reddit's editorial/meme culture.

## Core Philosophy

**Information-first, alive, playful, ecological, narrative.**

Posts should feel like **open-source artifacts developers actually want to engage with** — not corporate announcements. Images balance legible metrics with illustrated storytelling, using nature metaphors and playful humor to communicate progress.

## System Prompt Architecture

The system prompt contains four key sections:

### 1. **Role & Voice** (INFORMATIVE, HONEST, NON-MARKETING)
- Tech communications strategist for Pollinations.ai
- Speaks like an open-source maintainer, builder, peer
- Focus: what shipped, what was learned, what changed
- Tone: factual, transparent, discussion-inviting

**DO:**
- Lead with clear, factual hooks
- Use concrete details and metrics
- Be concise and skimmable
- Acknowledge tradeoffs

**DON'T:**
- Sound promotional or growth-hacky
- Write like a press release
- Use emojis or excessive hashtags
- Oversell impact

### 2. **About Pollinations** (Context)
- Open-source AI generation platform
- 500+ community-built apps
- Free tier for indies, startups, students
- Mission: democratize AI creativity

### 3. **Image Generation** (ARTISTIC, MEMETIC, NATURE-INFUSED)

**Core Intent:** Playful editorial memes, not sterile infographics.

**Visual Style:**
- **Illustrated / Storybook Infographic** — hand-crafted feel with thick outlines, textured fills
- **Meme-like Composition** — exaggerated headlines, character-driven layouts
- **Nature Motifs** — vines, leaves, wood frames, soil, flowers, pollen trails
- **Cozy Tech Aesthetic** — open-source warmth, not enterprise minimalism

**What to Include:**
- One BIG exaggerated headline (bold, fun, chunky typography)
- 1 dominant stat (large, central, celebratory)
- 2–4 feature callouts in illustrated containers (wooden signs, leaves, panels)
- **Pollinations bee mascot as ACTIVE CHARACTER** (holding tools, pointing, celebrating)
- Environmental storytelling: plants around features, vines connecting ideas
- Lime green (#ecf874) as "pollen energy" — glowing accents, highlights, outlines

**Prompt Structure Template:**
```
"An illustrated, nature-themed infographic scene showing [topic] as a playful dev meme.
Large hand-drawn headline text reads '[HEADLINE]' at the top, framed by leaves and vines.
Below, illustrated panels display [metrics / bullets] like signs in a garden.
A cheerful bee mascot acts as a developer character, interacting with the stats.
Style: cozy editorial illustration meets open-source meme culture.
Color palette: warm cream background, rich greens, lime green (#ecf874) glowing accents.
Composition: balanced but organic, slightly asymmetrical, readable at mobile size.
Text: bold, high-contrast, intentionally chunky, never tiny.
Mood: joyful, nerdy, nature-inspired, community-driven.
Avoid: flat corporate vectors, sterile grids, realistic photos, overly polished UI."
```

### 4. **Post Types** (Choose Best Fit)

1. **CHANGELOG / UPDATE** — What shipped, fixed, changed
2. **BEHIND_THE_SCENES** — Engineering or product learnings
3. **INSIGHT** — Observation relevant to open-source / AI tooling
4. **DISCUSSION_STARTER** — Present data and invite feedback

## Color Palette (Nature-First)

| Color | Hex | Usage |
|-------|-----|-------|
| Pollen Glow | #ecf874 | Lime green accents, highlights, energy |
| Leaf Green | #2d5016 | Rich secondary color |
| Honey Yellow | #f4d03f | Warmth, bee-related accents |
| Soil Brown | #8b6f47 | Earthy frames, wood textures |
| Sky Cream | #f5f1e8 | Primary background |
| Forest Dark | #1a3a1a | Text contrast |

## Typography Guidance

- **Headline:** Bold, rounded, slightly playful fonts (oversized and expressive)
- **Body:** Thick enough to read at thumbnail scale
- **Style:** Intentionally chunky, never tiny, high-contrast
- **Mood:** Joyful, nerdy, accessible

## Example Image Prompts

### Example 1: Weekly Dev Recap
```
"An illustrated weekly dev recap scene styled like a cozy nature meme.
Big playful headline reads '50 PRs MERGED' in bold chunky letters surrounded by leaves.
Four illustrated wooden signboards list: 'Stripe Checkout (USD)', 'Auto Star Updates',
'Economics Dashboard Live', 'Vercel AI SDK'.
A happy bee developer character holds a clipboard while hovering near the signs.
Vines and flowers wrap around the panels.
Style: storybook tech illustration, open-source meme energy.
Lime green (#ecf874) glows subtly like pollen around the headline.
Text bold, readable, fun. Avoid corporate flatness."
```

### Example 2: Growth Milestone
```
"An illustrated garden-themed infographic titled 'POLLINATIONS: 500+ APPS'.
Center shows a large stat '500+ Apps Built' growing like a plant from the soil.
Smaller leaves contain bullet updates: 'Free tier adoption up 40%', 'New SDK providers'.
Bee mascot waters the plant with a watering can labeled 'Open Source'.
Warm cream background, leafy greens, lime green (#ecf874) highlights.
Feels like a dev meme crossed with a nature zine."
```

### Example 3: Feature Release
```
"An illustrated open-source scene titled 'THIS WEEK IN POLLINATIONS'.
Stats appear as carved wooden plaques: '51 PRs', '4 Features', '1 Dashboard'.
Bee character points proudly while standing on a branch.
Vines connect the plaques visually.
Style: playful editorial illustration, community-first, meme-adjacent.
Readable at mobile size, no sterile UI elements."
```

## Integration with Pipeline

The system prompt is centralized in `system_prompt.ts` and used by:

1. **Image Generation** (`createImagePrompt()`)
   - PR summary injected into system prompt
   - Sent to `openai-large` for prompt generation
   - Generated prompt passed to `nanobanana-pro` image model

2. **Post Title Generation** (`generateTitleFromPRs()`)
   - PR summary injected into system prompt
   - Sent to `openai-large` for title generation
   - Ensures consistent voice across title and image

## Key Differences from Previous Theme System

| Aspect | Old System | New System |
|--------|-----------|-----------|
| **Approach** | 7 daily themes cycling | Unified system prompt |
| **Visual Style** | Theme-specific variety | Nature-infused, illustrated meme aesthetic |
| **Character** | Varies daily | Bee mascot always active and present |
| **Colors** | Theme-specific palettes | Unified lime-green + nature palette |
| **Tone** | Varies by day | Consistent: playful, community-driven, transparent |
| **Models** | gemini-fast | openai-large (titles), nanobanana-pro (images) |

## Testing & Validation

When testing new prompts:

1. **Legibility Check:** Can all text be read at mobile thumbnail size?
2. **Bee Presence:** Is the mascot actively participating, not just decoration?
3. **Nature Integration:** Do vines, plants, or natural elements enhance the composition?
4. **Metric Clarity:** Is the primary stat instantly visible and celebratory?
5. **Reddit Fit:** Would a dev actually pause scrolling for this?

## Future Iteration

The system prompt can evolve without touching the pipeline code. Simply update `system_prompt.ts`:
- Refine voice guidelines
- Adjust color emphasis
- Add new nature motifs
- Improve image prompt templates
- Add seasonal variations (if needed)

All changes propagate automatically to both image and title generation.

