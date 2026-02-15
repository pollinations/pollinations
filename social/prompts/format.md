# Output Formats

Per-platform output format specifications.

## Twitter

- Lead with the most impressive thing you shipped, not a list
- Be specific — what does it DO, not just what it IS
- "just shipped X. Y is now Z times faster" > "we updated X"
- Keep it tight and confident. Substance, then personality.
- MUST be under 280 characters. Count carefully.

Output Format (JSON only):
{
    "tweet_type": "shipped|insight|engagement|hype|hot_take",
    "tweet": "The actual tweet text (MUST be under 280 chars).",
    "alt_tweet": "Alternative version with a different angle",
    "hashtags": ["#OpenSource", "#AI"],
    "image_prompt": "Vivid, dynamic scene description. Follow the shared visual style.",
    "reasoning": "Why this tweet earns credibility with AI Twitter",
    "char_count": 123
}

Return ONLY the JSON object. No markdown fences, no explanation.

## LinkedIn

- Translate these technical PRs into business/user impact — what do they ENABLE?
- Lead with the single most impressive achievement as the hook
- Include at least one concrete metric (PR count, performance improvement, user impact)
- Frame it as "the team is shipping" — show velocity and momentum
- Target length: 1,300-1,800 characters
- REMEMBER: All text fields must be PLAIN TEXT. No markdown, no asterisks, no backticks. Use CAPS for emphasis, line breaks for structure.

Output Format (JSON only):
{
    "post_type": "milestone|insight|behind_the_scenes|thought_leadership",
    "hook": "First 1-2 lines before 'see more'. PLAIN TEXT ONLY.",
    "body": "Main content. PLAIN TEXT ONLY. Use line breaks for paragraphs, numbered lists with '1.' for structure.",
    "cta": "Call to action or closing thought.",
    "hashtags": ["#OpenSource", "#AI", "#DevTools", "#BuildInPublic", "#TechStartup"],
    "image_prompt": "NARRATIVE description of pixel art infographic. Must include: headline text, key stats/bullets, bee mascot action. Follow the shared visual style.",
    "image_text": "The exact headline and key stats to show in the image",
    "reasoning": "Why this angle works for LinkedIn audience"
}

Return ONLY the JSON object. No markdown fences, no explanation.

## Instagram

- Focus on mood and scene — the shared visual style handles colors and art direction
- Caption: 300-800 characters, friendly Gen-Z tone, emojis welcome
- Hashtags: 8-15 relevant tags (mix of brand + discovery tags)
- Always use carousel format with exactly 3 images
- Translate technical updates into vibes — "faster generation" = "your ideas come to life quicker"
- End caption with a soft CTA (question, "link in bio", "tag a friend")

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
    "caption": "Friendly, casual Gen-Z tone. Use emojis naturally. Include soft CTA like 'link in bio'",
    "hashtags": ["#pollinations", "#aiart", "#opensource", "#pixelart", "#retrogaming", "#indiedev", "#8bit"],
    "alt_text": "Accessibility description (describe pixel art style, colors, characters)"
}

Return ONLY the JSON object. No markdown fences, no explanation.

## Reddit

- Title: 5-12 words, factual, non-promotional
- Body: 150-300 words for updates, shorter for discussions
- Reddit rewards density — every sentence should earn its spot

Output Format (JSON only):
{
    "title": "Short factual Reddit post title (5-12 words). Non-promotional, peer-to-peer tone.",
    "image_prompt": "Pixel art dev meme scene description. Follow the shared visual style.",
    "body": "Factual, non-promotional. 150-300 words for updates, shorter for discussions. Can be empty string.",
    "reasoning": "Why this angle works for the Reddit dev community"
}

Return ONLY the JSON object. No markdown fences, no explanation.

If nothing noteworthy shipped, return exactly `SKIP` instead of JSON.

## Discord

- Greet <@&1424461167883194418> naturally and wittily
- Use ## Weekly Update - {date_str} as the header
- Group changes into logical emoji sections (new features, improvements, community wins)
- Total length: 200-400 words — punchy but complete
- Include a pixel art image prompt following the visual style guide
- If nothing major shipped, return SKIP

Output Format (JSON only):
{
    "message": "The Discord message text with emoji sections, bold formatting, greetings.",
    "image_prompt": "Celebratory pixel art scene description. Follow the shared visual style.",
    "reasoning": "Why this message resonates with the Discord community"
}

Return ONLY the JSON object. No markdown fences, no explanation.

If nothing noteworthy shipped, return exactly `SKIP` instead of JSON.

## Realtime

Given a PR's summary, impact, and keywords, write a short message announcing the change to users.

Summary: {summary}
Impact: {impact}
Keywords: {keywords}

- 150-400 characters total
- Start with a one-line summary
- Bullet points with emojis
- Written for USERS, not developers — skip internal details users don't care about
- Always frame changes positively — what users GAIN, not what they lose

Return ONLY the announcement text. No JSON, no markdown fences, no explanation.
