# Weekly Update - 2025-08-16

- **Fix TinyBird text_moderation partitioning** — Revert telemetry changes and update `text_moderation` datasource to use `toYYYYMM(timestamp)` as the partition key to resolve "TOO_MANY_PARTS" errors. [PR #3725](https://github.com/pollinations/pollinations/pull/3725)
- **Update Discord nickname** — Correct a mistake in the Discord nickname configuration. [PR #3697](https://github.com/pollinations/pollinations/pull/3697)
- **Optimize Tinybird datasource partitioning** — Change `text_moderation` partition key to date-based `toYYYYMM(timestamp)` and update sorting keys to `(timestamp, id)` to prevent ingestion rate limits. [PR #3715](https://github.com/pollinations/pollinations/pull/3715)
- **Define text events data source** — Define the structure for the text events data source. [PR #3656](https://github.com/pollinations/pollinations/pull/3656)
- **Add Pollix AI** — Add Pollix AI to the project list. [PR #3695](https://github.com/pollinations/pollinations/pull/3695)
- **Refactor message sanitization** — Extract message sanitization, placeholder insertion, and Bedrock conversation adjustments into a dedicated `utils/messageSanitizer.js` utility. [PR #3696](https://github.com/pollinations/pollinations/pull/3696)
- **Implement roblox-rp Bedrock model** — Add `roblox-rp` model configuration which randomly selects from multiple AWS Bedrock models to distribute load and provide variety. [PR #3679](https://github.com/pollinations/pollinations/pull/3679)
- **Improve error handling** — Enhance stability in `text.pollinations.ai/server.js` by adding error handling to `sendErrorResponse()` to prevent server crashes during response failures. [PR #3661](https://github.com/pollinations/pollinations/pull/3661)
- **Add EasyGen AI to chatProjects** — Update `chat.js` to include EasyGen AI, a tool for generating Mermaid diagrams and flowcharts. [PR #3590](https://github.com/pollinations/pollinations/pull/3590)
- **Add encrypted env file** — Add encrypted environment configuration file for `text.pollinations.ai`. [PR #3557](https://github.com/pollinations/pollinations/pull/3557)
- **Remove special bee references** — Remove all links, documentation, and issue templates related to "special bee requests" in favor of the generic tier system. [PR #3581](https://github.com/pollinations/pollinations/pull/3581)
