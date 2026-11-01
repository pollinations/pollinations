---
job: daily
tone: x
temperature: 0.8
pictures: ["x.jpg"]
required: ["tweet"]
---
Write a tweet about today's shipped work.

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
