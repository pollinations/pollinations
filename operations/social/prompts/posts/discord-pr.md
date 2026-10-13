---
job: pr
tone: discord
temperature: 0.7
---
# Discord Post For Each Merged PR

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
