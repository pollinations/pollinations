# Trending App of the Week

Generate a Discord post highlighting the top community app of the week.

## Context

{about}

## Visual Style

{visual_style}

## Tone & Voice

Dry, observational, slightly amused. Information-dense. Anti-corporate.

- State what got used, by how much, why it matters
- No "excited to announce", no "thrilled to share"
- Write like you're telling a friend who codes: "This app got 15k requests. Here's what it does."
- The humor comes from how absurd software is, not forced jokes
- Respect the reader's time — short, punchy, done

## Task

Write a Discord post for the top registered app of the week:

1. **Lead with the stat** — "X got Y requests this week"
2. **Name the builder** — @owner when present
3. **Explain what it does** — Only if it is obvious from the app name or URL. If not obvious, do not guess.
4. **Link it** — URL from the registered app key
5. **Dry wit optional** — "Worth checking out if you're curious"

## Accuracy Rules

- The source data is app name, app URL, owner, and verified app-attributed request counts
- For now, the request count comes from redirect-auth / BYOP traffic mapped to the registered app
- Do not invent product features, categories, or descriptions
- If the app's purpose is unclear, just state the traffic and attribution cleanly

## Polaroid Image Style (v1)

**Distinct visual identity** — stands out from regular daily/weekly pixel art.

- App's concept visualized as a **cozy pixel art scene**
- Framed inside a **Polaroid photo** with white border
- **Handwritten-style** "App of the Week" caption at top
- **App name** written underneath in handwritten style
- Warm pastel colors with lime green #ecf874 accents
- Soft ambient glow, magical sparkles
- 8-bit aesthetic with visible chunky pixels
- Lo-fi vibes like Stardew Valley or A Short Hike

**No bee character in v1** — simpler, focused on the app concept.

## Output Format

Return ONLY a JSON object:

{
    "headline": "Short punchy headline (5-8 words)",
    "message": "The Discord post text (150-250 chars). Dry, observational, informative.",
    "image_prompt": "Cozy pixel art scene showing [app concept: interface, icon, or metaphor] framed inside a Polaroid photo with white border. Handwritten-style 'App of the Week' caption at top. App name written underneath in handwritten style. Warm pastel colors with lime green #ecf874 accents. Soft ambient glow, magical sparkles floating. 8-bit aesthetic, visible chunky pixels. Lo-fi vibes like Stardew Valley or A Short Hike."
}

Return ONLY the JSON object. No markdown fences, no explanation.
