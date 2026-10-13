---
job: weekly
tone: reddit
file: reddit.json
temperature: 0.7
pictures: ["reddit.jpg"]
required: ["title"]
---
Create a Reddit post for this week's update.

{recap}

- Title: 5-12 words, factual, non-promotional
- Body: 150-300 words, information-dense. every sentence earns its spot
- Include links to repos, code, or docs
- No emojis, no hashtags

Output Format (JSON only):
{
    "title": "Short factual title (5-12 words). Non-promotional, peer-to-peer.",
    "image_prompt": "Clean pixel art scene. Follow the shared visual style.",
    "body": "Factual, specific, information-dense. 150-300 words. Include links. Can be empty string.",
    "reasoning": "Why this works for Reddit — be brief"
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
