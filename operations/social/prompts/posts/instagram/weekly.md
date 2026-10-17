---
job: weekly
tone: instagram
temperature: 0.7
pictures: ["instagram-1.jpg", "instagram-2.jpg", "instagram-3.jpg"]
required: ["caption"]
---
Create a cozy pixel art post about this week's updates.

{recap}

- Focus on mood and scene — the shared visual style handles colors and art direction
- Caption: 300-800 characters, friendly tone, emojis welcome
- Hashtags: 8-15 relevant tags (mix of brand + discovery tags)
- Always use carousel format with exactly 3 images
- Rotate characters across the carousel: e.g. Polli solo, Polli + Robot, Polli + Nomnom. Don't repeat the same pairing
- Translate technical updates into vibes — "faster generation" = "your ideas come to life quicker"

Output Format (JSON only):
{
    "content_type": "pixel_art|retro_infographic|cozy_scene",
    "linked_images": true,
    "strategy_reasoning": "Why this visual approach works for our brand",
    "visual_style": "Description of the pixel art style you're going for",
    "image_count": 3,
    "images": [
        {
            "prompt": "Detailed scene description — mood, characters, composition. Follow the shared visual style.",
            "description": "What this image communicates",
            "text_in_image": "Short pixel-font text if any (keep minimal)"
        }
    ],
    "caption": "Genuine, brief. What shipped, why it's interesting. Include link or repo mention.",
    "hashtags": ["#pollinations", "#opensource", "#aitools", "#pixelart", "#creativecoding", "#indiedev"],
    "alt_text": "Accessibility description"
}

Return ONLY the JSON object. No markdown fences, no explanation.

## Weekly Image Identity

This is a WEEKLY recap post. The image should feel like a recurring episode:
- Include a creative weekly label as text-in-image (e.g. "Weekly Wrap", "This Week's Buzz", "Week in Review")
- Pick a label that matches the week's mood — celebratory, productive, chill, etc.
- Make it feel like a series the audience looks forward to

Since this covers a full week, the image should carry more info:
- Include 2-4 short labels or callouts (feature names, arc titles) in retro UI panels or pixel signboards
- Keep the cozy 8-bit pixel art style — info woven into the pixel world, not on top of it
- Think retro RPG inventory screen, quest log, or achievement board
- Keep text chunky and readable, never tiny or cramped
- Specify the exact short headings as the only text; use visual icons inside panels, never invented body copy or tiny bullet lists.
