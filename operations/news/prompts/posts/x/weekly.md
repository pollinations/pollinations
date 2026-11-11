---
job: weekly
tone: x
temperature: 0.8
pictures: ["x.jpg"]
required: ["tweet"]
---
Write a tweet about this week's shipped work.

{recap}

- Lead with what shipped, not a hook
- Be specific — what does it DO, not just what it IS
- Dry, observational tone. humor through understatement
- MUST be under 280 characters. Count carefully.

Output Format (JSON only):
{
    "tweet_type": "shipped|field_notes|observation|useful",
    "tweet": "The actual tweet text (MUST be under 280 chars).",
    "alt_tweet": "Alternative version with a different angle",
    "hashtags": ["#OpenSource", "#AI"],
    "image_prompt": "Vivid, clean scene description. Follow the shared visual style.",
    "reasoning": "Why this works — be brief",
    "char_count": 123
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
