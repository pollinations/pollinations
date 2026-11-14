---
job: weekly
tone: linkedin
temperature: 0.7
pictures: ["linkedin.jpg"]
required: ["hook", "body", "closing"]
max_chars: 1248
retry: "\n\nThe previous draft below was {count} characters, exceeding the limit by {over}. Rewrite it more concisely, preserving the facts, required fields, and image prompt. Leave room for separators and hashtags.\n"
---
Create a LinkedIn post about this week's development work. The final assembled post including hashtags MUST be 1248 characters or fewer because Buffer rejects anything longer.{retry}

{recap}

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
