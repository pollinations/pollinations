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

The post is a Discord card. Its Area, Work type, PR number and author are shown separately, so never repeat them.

- Announce this PR even when it is small or internal. Pick the key change and at most two supporting details; do not list everything.
- First line: a plain headline of at most 70 characters naming the change. No markdown, no emoji, no ending period.
- Then 1–3 bullets, each one line of at most 110 characters: `- `, one emoji, then one short fact. One bullet is enough for a small change.
- Link a bullet's words to the page where the reader acts on it, as `[words](url)`, using only URLs from the gist's `links`. Never write any other URL; leave text unlinked when no listed page fits.
- Hard maximum 400 characters in total.
- Written for people who use the tools — explain internal work plainly without inventing a change in app behavior
- **Pick the load-bearing specifics out of the gist and put them in the message**: names (models, endpoints, packages, providers, features), numbers (versions, defaults, prices, limits, sizes, timeouts), and before/after values when behavior changes. Don't substitute them with category labels ("updated plans", "new model added", "API improvements"). If the PR is about changing a value or naming a thing, the message must include that value or name.
- Plain language, no hype
- Describe the merged change without routine deployment disclaimers. Include announced effective dates for scheduled changes; do not claim it is live without evidence.

Return ONLY the announcement text. No JSON, no markdown fences, no explanation.
