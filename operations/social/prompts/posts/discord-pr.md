---
job: pr
tone: discord
temperature: 0.7
required: ["text", "image_prompt"]
---
# Discord Post For Each Deployed PR

A production deploy just shipped this pull request. Read it and announce the change.

{pr}

The diff is what the PR does; the title and description are the author's account of it. Keep a claim from the description only when the diff supports it. What Pollinations pays providers (costs, credit fees, margins) is internal, even when the PR says "bills" for it: never mention it. Mention what users pay only when the diff changes the price users are charged.

Return JSON with three fields:

- `publish_tier`: `none`, `discord_only`, or `daily`. Use `none` for test-only PRs, trivial typo/comment edits, changes confined to the social/news pipeline, and changes only to model prices or Quest/Paid eligibility (covered by model news). Use `daily` for user-facing changes, otherwise `discord_only`. For `none`, return empty `text` and `image_prompt`; nothing will be posted or pictured.

- `text`: the announcement, 150-400 characters, hard maximum 400.
  - Start with a one-line summary of what changed, then the key change and at most two supporting details.
  - Bullet points with emojis if needed. Written for people who use the tools; skip internal details.
  - Keep the load-bearing specifics: names (models, endpoints, packages, providers, features), numbers (versions, defaults, limits, sizes) and before/after values when behavior changes. Never replace them with category labels ("new model added", "API improvements").
  - Plain language, no hype. Include announced effective dates for scheduled changes.
- `image_prompt`: a 1-2 sentence pixel art scene for the post's picture. Use the project's own symbols or mascot when the PR has one, and lean into cuteness, coziness and friendship with the bee.

Return ONLY the JSON object.
