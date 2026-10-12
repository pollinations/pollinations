---
job: daily
tone: reddit
file: reddit.json
temperature: 0.7
pictures: ["reddit.jpg"]
required: ["title"]
---
Create a Reddit post for today's update.

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
