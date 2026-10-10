# Output Formats

Per-platform output format specifications.

## Twitter

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

## LinkedIn

- Lead with what shipped. be specific and information-dense
- Dry, observational humor — find what's slightly absurd about the problem you solved
- Include real links to repos, docs, or tools mentioned
- Optional: unicode dividers (───) for section breaks
- HARD MAX: 1248 characters total after assembling hook + body + closing + blank lines + hashtags. Buffer rejects anything longer.
- Target length: 800-1,100 characters. shorter is better — don't pad
- Budget it: hook <= 220 chars, closing <= 120 chars, 3-5 short hashtags
- REMEMBER: All text fields must be PLAIN TEXT. No markdown, no asterisks, no backticks. Use CAPS for emphasis, line breaks for structure.

Output Format (JSON only):
{
    "post_type": "dispatch|field_notes|observation",
    "hook": "First 1-2 lines before 'see more'. PLAIN TEXT ONLY. No clickbait hooks — just state what this is about.",
    "body": "Main content. PLAIN TEXT ONLY. Use line breaks for paragraphs, numbered lists with '1.' for structure. Include links where relevant.",
    "closing": "Brief closing — 'repo is public', 'contributions welcome', or a link. Not a manufactured question.",
    "hashtags": ["#OpenSource", "#AI", "#DevTools", "#BuildInPublic"],
    "image_prompt": "Pixel art bulletin/dispatch scene. Include: headline text, key items, bee mascot. Follow the shared visual style.",
    "image_text": "The exact headline and key items to show in the image",
    "reasoning": "Why this angle — be brief"
}

Return ONLY the JSON object. No markdown fences, no explanation.

## Instagram

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

## Reddit

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

## Discord

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

## Website

- Title: 3-8 words naming the month's main story. No month name or date; the page shows those.
- Summary: one plain paragraph, 2-3 sentences, 250-420 characters. What people can do now, with the specific names.
- Image: the next page of the picture book. Follow the Monthly Story rules below.
- Story: 1-2 sentences describing the scene as it now stands (the place, who is there, what changed this month) and one thing left open, started or hinted at, so next month's cover can follow it up.

Output Format (JSON only):
{
    "title": "Short title for the month's main story",
    "summary": "One plain paragraph about what changed for people this month.",
    "image_prompt": "Wide 16:9 pixel art scene that continues last month's cover. Follow the shared visual style.",
    "story": "Where the picture book stands after this month.",
    "reasoning": "Why this angle — be brief"
}

Return ONLY the JSON object. No markdown fences, no explanation.

## Realtime

Given a PR's factual gist, write a short message announcing the change.

PR gist:
{gist}

Use exact model values from announcements when present, and the summary for billing context. A field ending in `Tokens` can represent one image or character; use explicit units from the catalog or summary, and omit a rate if its unit is unknown. A scheduled change has not happened yet. Missing values are unknown; do not invent them.

- 150-400 characters total, hard maximum 400. Pick the key change and at most two supporting details; do not list everything.
- Start with a one-line summary of what changed
- Bullet points with emojis if needed
- Written for people who use the tools — skip internal details
- **Pick the load-bearing specifics out of the gist and put them in the message**: names (models, endpoints, packages, providers, features), numbers (versions, defaults, prices, limits, sizes, timeouts), and before/after values when behavior changes. Don't substitute them with category labels ("updated plans", "new model added", "API improvements"). If the PR is about changing a value or naming a thing, the message must include that value or name.
- Plain language, no hype
- Describe the merged change without routine deployment disclaimers. Include announced effective dates for scheduled changes; do not claim it is live without evidence.

Return ONLY the announcement text. No JSON, no markdown fences, no explanation.
