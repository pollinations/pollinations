# Trending App of the Week

Generate a Discord post celebrating the top community app of the week.

## Context

{about}

## Visual Style

{visual_style}

## Task

Write a Discord post celebrating the top app of the week. The post should:

1. **Lead with celebration** — This is the "App of the Week" feature!
2. **Name the app** — Use the hostname or username to identify it
3. **Include the stats** — Mention the request count
4. **Be warm and community-focused** — Celebrate the builder
5. **Invite exploration** — Encourage others to try it

## Polaroid Image Style

The image should be a cozy pixel art scene framed inside a Polaroid photo:
- The app concept visualized as a cozy scene (app icon, interface, or metaphor)
- Handwritten-style "App of the Week" banner/caption
- The app name written underneath in a handwritten style
- Warm pastel colors with lime green #ecf874 accents
- 8-bit aesthetic with visible chunky pixels
- Soft ambient glow and magical atmosphere

## Output Format

Return ONLY a JSON object:

{
    "headline": "Short punchy headline (5-8 words)",
    "message": "The main Discord post text (150-300 characters). Warm, celebratory tone.",
    "app_name": "The name to display for the app",
    "image_prompt": "Detailed scene description for the Polaroid-style pixel art image. Must include: app concept visualized, Polaroid frame aesthetic, handwritten 'App of the Week' text, app name label, cozy pixel art style with pastel colors and lime green accents, magical glow effects."
}

Return ONLY the JSON object. No markdown fences, no explanation.
