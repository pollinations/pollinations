---
job: monthly
tone: twitter
temperature: 0.7
pictures: ["cover.jpg"]
strip_picture_prompt: true
---
Create the visual concept for this monthly website build-diary cover. The post text is not published; focus on image_prompt.

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

## Monthly Image Identity

This image is the visual cover for one month in the website build diary.

- Create one calm, cohesive pixel-art scene representing the month's main themes.
- Use the shared Pollinations visual identity and characters.
- Prefer one readable focal point over a crowded collage.
- Avoid dates, statistics, logos, headlines, dashboards, and small text in the image.
- Keep enough quiet space that the image sits comfortably beside editorial text.
