---
job: weekly
tone: discord
temperature: 0.7
pictures: ["discord.jpg"]
required: ["message"]
---
Write a Discord message about the latest updates.

{recap}

- Greet <@&1424461167883194418> naturally — don't overthink it
- Use ## Weekly Update - {date_str} as the header
- Group changes into logical sections with emojis
- Total length: 150-300 words — brief but complete
- Include links to relevant repos, PRs, or docs

Output Format (JSON only):
{
    "message": "The Discord message text. Brief, scannable, genuine.",
    "image_prompt": "Pixel art update scene. Follow the shared visual style.",
    "reasoning": "Why this resonates — be brief"
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
