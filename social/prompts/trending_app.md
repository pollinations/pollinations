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

Write a Discord post for the top app of the week:

1. **Lead with the stat** — "X got Y requests this week"
2. **Name the builder** — @username or hostname
3. **Explain what it does** — One sentence, information-dense
4. **Link it** — URL from APPS.md
5. **Dry wit optional** — "Worth checking out if you're curious"

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
    "app_name": "The name to display for the app",
    "image_prompt": "Cozy pixel art scene showing [app concept: interface, icon, or metaphor] framed inside a Polaroid photo with white border. Handwritten-style 'App of the Week' caption at top. App name written underneath in handwritten style. Warm pastel colors with lime green #ecf874 accents. Soft ambient glow, magical sparkles floating. 8-bit aesthetic, visible chunky pixels. Lo-fi vibes like Stardew Valley or A Short Hike."
}

Return ONLY the JSON object. No markdown fences, no explanation.
