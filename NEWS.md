# Product & Platform Updates

<!-- ENTRY:2025-12-03 -->
### 2025-12-03

- **Add Aqua Application Programming Interface to vibeCoding** — Adds **Aqua Application Programming Interface** to **vibeCoding** projects. [PR #5589](https://github.com/pollinations/pollinations/pull/5589)

- **Add Noir Ink Tattoo Studio to chat** — Adds **Noir Ink Tattoo Studio** to chat projects with AI-powered tattoo design generation, booking system, and educational resources. [PR #5587](https://github.com/pollinations/pollinations/pull/5587)

- **Add payment delay notice and improve dashboard styling** — Add purchase info box with beta double pollen and 1-2 min delay notice. Update balance section to use `violet-50/30` background matching other sections. Add Featured App link to tier-explanation pointing to app submission form. Standardize warning banner styling (`text-sm`, gradient container) across components. [PR #5586](https://github.com/pollinations/pollinations/pull/5586)

- **Fix Chat.pollinations.ai problems with thinking** — Fixed a problem with the responses in Chat.pollinations.ai related to thinking functionality. [PR #5579](https://github.com/pollinations/pollinations/pull/5579)

- **Add AI-powered project submission review workflow** — Add `ai-review-apps.yml` workflow where Claude reviews submissions, creates PRs or requests info. Add `apps-pr-merged.yml` workflow that celebrates and sets `app:approved` on merge. Update issue template with `app:review` label, fix category emojis, add language field. Implements 4-label tier system: `app:review`, `app:info-needed`, `app:approved`, `app:denied`. [PR #5577](https://github.com/pollinations/pollinations/pull/5577)

- **Add web search icon for Perplexity and Gemini Search models** — Adds `search` capability to `ServiceDefinition` and `ModelInfo` types. Adds `search: true` to `gemini-search`, `perplexity-fast`, `perplexity-reasoning` models. Adds `hasSearch()` helper and 🔍 icon display in pricing table. Updates model descriptions to mention web search. Adjusts pricing table column widths for better layout. [PR #5575](https://github.com/pollinations/pollinations/pull/5575)

- **Refine tier UI with explanation panel and styling updates** — Add **TierExplanation** component showing tier progression (Spore → Seed → Flower → Nectar) with pollen values and requirements. Nest TierExplanation inside TierPanel for unified section layout. Refine news banner with cleaner white/transparent background and simplified fonts. Update beta notice with purple/indigo gradient styling. Clean up unused code (`TIER_ORDER`, `capitalize` function, `target_tier` prop). Minor `POLLEN_FAQ` wording updates. [PR #5573](https://github.com/pollinations/pollinations/pull/5573)

- **Fix streaming integration tests** — Fix streaming integration tests by making `minBatchSize` configurable. Add checks for correct event creation to non-streaming tests. Add missing snapshot for `openai-fast`. [PR #5572](https://github.com/pollinations/pollinations/pull/5572)

- **Remove now invalid migration** — Remove invalid migration that was forgotten in the `fix/regenerate-latest-migrations-to-fix-snapshots` branch. [PR #5571](https://github.com/pollinations/pollinations/pull/5571)

- **Regenerate latest migrations from schema changes** — Migrations were created without using `npm run gen:migrations` originally which led to snapshots not being created correctly. Adds new migration properly generated via `drizzle`. Removes `error_details` and `error_stack`. Adds `token_price_completion_video_seconds` and `token_count_completion_video_seconds`. [PR #5570](https://github.com/pollinations/pollinations/pull/5570)

- **Video API - I2V model, duration param + OpenAPI docs** — Fix seedance image-to-video by using the correct I2V model ID (`seedance-1-0-lite-i2v-250428` when image is provided, `seedance-1-0-lite-t2v-250428` for text-only). Simplify duration parameter to thin proxy approach. Add OpenAPI documentation for image/video endpoint. [PR #5565](https://github.com/pollinations/pollinations/pull/5565)

- **Add voting status diagram skill and Discord config** — Add `.claude/skills/voting-status/SKILL.md` for generating ASCII voting diagrams. Add `.windsurf/workflows/update-voting-status.md` workflow. Add Discord guild ID and channel configs to `AGENTS.md` (channels: chat, pollen-beta, news-polls). [PR #5559](https://github.com/pollinations/pollinations/pull/5559)

- **Chat.Pollinations.AI Update with Video Generation and tutorial** — Introduces support for chart rendering in messages using `chart.js` and `react-chartjs-2`. Adds video generation capabilities. Includes comprehensive tutorial for new users. Enhanced session and model selection controls. Branch cleanup implementation for repository maintainers. [PR #5553](https://github.com/pollinations/pollinations/pull/5553)

- **Add news banner for Dec 2025 update** — Add closable news banner component. Show pollen rebalance (🦠1 🌱3 🌸10 🍯20). Display new models (claude opus 4.5, kimi k2, seedream 4, veo 3.1, seedance). Add to dashboard and sign-in pages. Dismissal persists via `localStorage`. [PR #5545](https://github.com/pollinations/pollinations/pull/5545)

- **Add login provider voting issue + update tier pollen values** — Add voting issue #5543 for login providers (Google, Discord, Email, Phone, WeChat, Wallet). Add subtle "more options?" link under GitHub login button in sign-in page. Update tier-management skill with correct pollen values (1/3/10/20). Add upgrade paths section to tier skill. Addresses community feedback on login options for users in India, China, and other regions. [PR #5544](https://github.com/pollinations/pollinations/pull/5544)

- **Chat.Pollinations.AI Website Code SYNC** — Syncing the files for chat.pollinations.ai from the other repository. [PR #5536](https://github.com/pollinations/pollinations/pull/5536)

- **Add tests for updated event processing** — Adds tests ensuring: events are not processed if count is below `minBatchSize` and events are recent; events are processed if count meets `minBatchSize` threshold; events are processed if older than 30 seconds even if below `minBatchSize`; expired sent events are cleared after processing. [PR #5534](https://github.com/pollinations/pollinations/pull/5534)

- **Correct ReThink AI URL** — Fix ReThink AI URL from `rethink.co.id` to `rethink.web.id`. Addresses review feedback on #5491. [PR #5512](https://github.com/pollinations/pollinations/pull/5512)

- **Add max-tokens limit for Llama 3.1 8B (mistral-fast)** — Fixes Bedrock `ValidationException` for `mistral-fast` model. Default `max_tokens` exceeded Llama 3.1 8B limit of 8192. Sets explicit 4096 limit in `modelConfigs.ts`. [PR #5503](https://github.com/pollinations/pollinations/pull/5503)

- **Add ViralFlow AI to creative projects** — Adds ViralFlow AI video generator to creative projects. Uses Pollinations.ai for image generation. [PR #5502](https://github.com/pollinations/pollinations/pull/5502)

- **Improve PDF-to-Speech project description** — Enhanced description for PDF-to-Speech project. [PR #5501](https://github.com/pollinations/pollinations/pull/5501)

- **Improve AI Stickers Generator description** — Enhanced description for AI Stickers Generator project. [PR #5500](https://github.com/pollinations/pollinations/pull/5500)

- **Improve Pollinations Gallery description** — Enhanced description for Pollinations Gallery project. [PR #5499](https://github.com/pollinations/pollinations/pull/5499)

- **Improve LINE Blessing Images Bot description** — Enhanced description for LINE Blessing Images Bot project. [PR #5498](https://github.com/pollinations/pollinations/pull/5498)

- **Improve GPTAI.host project description** — Enhanced description for GPTAI.host project. [PR #5497](https://github.com/pollinations/pollinations/pull/5497)

- **Improve ReThink AI project description** — Enhanced description for ReThink AI project. [PR #5496](https://github.com/pollinations/pollinations/pull/5496)

- **Improve Samaritan AI project description** — Enhanced description for Samaritan AI project. [PR #5495](https://github.com/pollinations/pollinations/pull/5495)

- **Improve Fikiri Chat AI project description** — Enhanced description for Fikiri Chat AI project. [PR #5494](https://github.com/pollinations/pollinations/pull/5494)

- **Improve Prompt Vision project description** — Enhanced description for Prompt Vision project. [PR #5493](https://github.com/pollinations/pollinations/pull/5493)

- **Improve xibe-chat-cli project description** — Enhanced description to highlight PyPI availability and terminal-based features. [PR #5492](https://github.com/pollinations/pollinations/pull/5492)

- **Add 13 community projects to showcase** — Add 13 new community projects from open APPS submissions. Chat projects: Xibe-chat-cli, Fikiri Chat AI, PollinationsFreeAI, Samaritan AI, ReThink AI 🇮🇩. Creative projects: Prompt Vision, Pollinations Gallery, AI Stickers Generator, StickerHub. [PR #5491](https://github.com/pollinations/pollinations/pull/5491)

- **Add tier management + issue-maker Claude skills** — Add `tier-management` Claude skill (evaluate + update tiers). Add `issue-maker` Claude skill for GitHub issue creation. Add `user update-tier` command to `manage-polar.ts`. Add helper scripts: `update-tier.sh`, `fetch-stargazers.sh`, `batch-evaluate.sh`. Fix: Add subscription active status check before updating. Fix: Remove dead code (function ref check). [PR #5484](https://github.com/pollinations/pollinations/pull/5484)

- **Fix Tier panel showing "Unknown Tier" and "0 pollen/day"** — Fix `active_tier_name` and `daily_pollen` missing from `/api/tiers/view` response. Root cause: `polar` import was the Hono middleware, not the Polar SDK client, causing `polar.products.get()` to silently fail. Fix: Use `c.var.polar.client.products.get()` instead. [PR #5483](https://github.com/pollinations/pollinations/pull/5483)

- **Remove error blobs to fix D1 SQLITE_NOMEM errors** — Fix frequent `SQLITE_NOMEM` errors under load caused by `error_stack` and `error_details` TEXT columns storing large blobs (10KB+ stack traces). Remove `errorStack` and `errorDetails` columns from event table. Error info still logged (visible in wrangler tail), just not stored in D1. Tinybird uses `DEFAULT 'undefined'` for missing fields. [PR #5480](https://github.com/pollinations/pollinations/pull/5480)

- **Ensure finish_reason accepts any string value, log wrong zod values** — Add clarifying comments that `finish_reason` accepts any string. Backends may return various values (`stop`, `length`, `error`, `max_tokens`, etc.). Add `reportInput: true` to Zod parse so errors show the actual invalid value. Forces redeploy to ensure latest schema is used. [PR #5479](https://github.com/pollinations/pollinations/pull/5479)

- **Use cached Polar API calls to prevent rate limiting** — Fix Polar API rate limiting (429 errors) by using cached functions. `routes/polar.ts`: Use cached `getCustomerState()` instead of direct `polar.customers.getStateExternal()`. `routes/tiers.ts`: Use cached `getCustomerState()` instead of direct API call. Remove unused `polar` client variable from `tiers.ts`. Routes were bypassing the existing KV cache and making direct Polar API calls, causing 429 rate limit errors (Polar limit: 300 req/min). [PR #5477](https://github.com/pollinations/pollinations/pull/5477)

- **Add resolve.dedupe for zod to fix CI build** — Add `resolve.dedupe: ["zod"]` to `vite.config.ts`. Fixes CI build failure when importing from `shared/registry/model-info.ts`. [PR #5476](https://github.com/pollinations/pollinations/pull/5476)

- **Clear buffered events after one day** — Clear successfully sent events from D1 buffer after one day. Improve batching: only send if minimum pending events OR events older than 30 seconds. Includes eulervoid's simpler approach from #5441. Reverts complex local balance tracking from #5453 (too complex, eulervoid's approach is better). [PR #5473](https://github.com/pollinations/pollinations/pull/5473)

- **Add PolliPalmTop to Chat projects** — Adds PolliPalmTop 📱 Android app to Chat category. Features: AI chat, web search, image generation. Dedicated Pollinations mobile companion. APK download available at `https://aiworld.institute/server/pollipalmtopv1.apk`. [PR #5471](https://github.com/pollinations/pollinations/pull/5471)

- **Update branding to community-built messaging** — Shift Pollinations messaging from "free, no API key" to "community-built, open, supporter-funded". Updates README.md, APIDOCS.md, `copywrite.js` LLM prompts, `seo.js` SEO description, Terms.jsx footer tagline, integration-guide.md outreach messaging, and POLLEN_FAQ.md. [PR #5467](https://github.com/pollinations/pollinations/pull/5467)

- **Fix error status propagation and Azure max_tokens** — Fix streaming errors returning HTTP 500 instead of upstream status (400, 401, etc.). Use `error.status` before `error.code` in `generateTextBasedOnModel`. Fix `errorTypes[statusCode]` → `errorTypes[responseStatus]` lookup. Include upstream error details in response. Convert `max_tokens` → `max_completion_tokens` for Azure OpenAI models. [PR #5460](https://github.com/pollinations/pollinations/pull/5460)

- **Add tier-evaluator Claude skill** — Adds Claude skill for automated user tier evaluation. Checks: 🌸 Flower (GitHub contributor OR project in lists), 🌱 Seed (Issue/PR involvement OR starred repo OR payment), 🍄 Spore (Default). Files: `SKILL.md` with instructions using `gh` CLI, `fetch-stargazers.sh` for cached stargazer lookup (3k+ users). [PR #5457](https://github.com/pollinations/pollinations/pull/5457)

- **Relax OpenAI schema for multi-provider compatibility** — Allow array content for system, developer, assistant, tool messages (not just user). Add `cache_control` support for Anthropic prompt caching. Add file content type for document uploads. Add passthrough for unknown content types. Make response `index`/`message` optional for non-OpenAI providers. [PR #5456](https://github.com/pollinations/pollinations/pull/5456)

- **Enable 4K resolution support for nanobanana-pro** — Add `imageConfig` with `aspectRatio` and `imageSize` to Vertex AI API calls. Auto-detect `imageSize` (1K/2K/4K) based on requested pixel count. Calculate closest standard aspect ratio from width/height. Increase nanobanana-pro default from 1024 to 2048 pixels. Root cause: Gemini 3 Pro Image API supports 4K via `imageSize` param but it wasn't being sent. [PR #5454](https://github.com/pollinations/pollinations/pull/5454)

- **Local balance tracking to reduce Polar API rate limits** — Store meter balances locally in KV (5min TTL). Only sync with Polar when cache miss or balance ≤ 0.1. Decrement balance locally after billable requests. Add `polar.ts` local balance cache with get/set/decrement. Add `track.ts` call to `decrementBalance` after billable requests. Add `polar.test.ts` balance tracking tests. Config: `LOCAL_BALANCE_TTL = 300` (5 min). [PR #5453](https://github.com/pollinations/pollinations/pull/5453)

- **Use /about for image service health check** — Fixes the image service health check in the enter-services deploy workflow. Problem: Image service doesn't have `/openai/models` endpoint, `/models` returns HTTP 410 (deprecated). Fix: Use `/about` endpoint which returns model info and HTTP 200. [PR #5447](https://github.com/pollinations/pollinations/pull/5447)

- **Remove --env production from wrangler deploy** — Fixes deployment failures for enter.pollinations.ai and enter-services. Wrangler 4.50+ with Vite plugin uses redirected configuration. `--env production` flag conflicts with Vite's `CLOUDFLARE_ENV` approach. Deployments have been failing since Nov 26. [PR #5446](https://github.com/pollinations/pollinations/pull/5446)

- **Add Portkey gateway deployment automation** — Adds automated deployment for Portkey API gateway. `text.pollinations.ai/scripts/deploy-portkey.sh` clones Portkey at pinned commit, deploys to Cloudflare. `.github/workflows/deploy-portkey-gateway.yml` GitHub Actions with manual trigger. `npm run deploy:portkey` script in text.pollinations.ai. Pinned to commit `9d9a37a` (v1.14.3). Overridable via `PORTKEY_COMMIT` and `PORTKEY_ENV` env vars. [PR #5442](https://github.com/pollinations/pollinations/pull/5442)

- **Relax OpenAI schema validation for multi-provider compatibility** — Fixes schema validation errors when using Gemini and other non-OpenAI providers. `finish_reason`: enum → string (accepts any provider value). `message.content`: nullable → nullish (accepts undefined). Gemini returns `MAX_TOKENS`, `SAFETY`, `RECITATION` etc. instead of OpenAI values. Truncated responses can have `undefined` content instead of `null`. [PR #5439](https://github.com/pollinations/pollinations/pull/5439)

- **Fix some secret decryption oversights** — Fix some oversights with secret decryption. [PR #5436](https://github.com/pollinations/pollinations/pull/5436)

- **Video Generation with Veo and Seedance** — Adds text-to-video and image-to-video generation capabilities with two new models: `veo` (Google Vertex AI, $0.15/sec) and `seedance` (BytePlus, $0.028/sec). Includes per-second billing for video models, video pricing UI in enter.pollinations.ai, and models marked as preview. Usage: `GET /prompt/{prompt}?model=veo` or `model=seedance`. [PR #5434](https://github.com/pollinations/pollinations/pull/5434)

- **Organize secrets and use JSON** — Restructures encrypted secrets to use JSON files stored in `**/secrets/*.json`. Updates npm scripts and GitHub Actions to match the new location. [PR #5433](https://github.com/pollinations/pollinations/pull/5433)

- **Add 3 community project submissions** — Adds SRT Translator CLI (Python subtitle translator) to creative tools, VisionText VS Code Extension to hackAndBuild, and TeleChars AI (Spanish Telegram bot platform) to socialBots. [PR #5432](https://github.com/pollinations/pollinations/pull/5432)

- **Update tier pollen amounts** — Adjusts daily pollen allocations: adds new Spore tier (1 pollen/day), reduces Seed from 10 to 3 pollen/day, reduces Flower from 15 to 10 pollen/day, Nectar unchanged at 20 pollen/day. [PR #5431](https://github.com/pollinations/pollinations/pull/5431)

- **Add Nano Banana Pro (Gemini 3 Pro Image)** — Adds `nanobanana-pro` model using `gemini-3-pro-image-preview` with support for 4K resolution and built-in "Thinking" process. Makes Vertex AI model ID configurable in vertexAIClient. Same API as `nanobanana`, different underlying model. [PR #5427](https://github.com/pollinations/pollinations/pull/5427)

- **Add Claude Opus 4.5 and default max_tokens for Bedrock** — Adds `claude-xlarge` model (Claude Opus 4.5) and introduces `defaultOptions` mechanism in modelResolver for provider defaults. Sets default `max_tokens: 16384` for Bedrock Lambda/Fargate models (previously 2048). Filters undefined values when merging options to preserve defaults. [PR #5426](https://github.com/pollinations/pollinations/pull/5426)

- **Refactor model aliases into separate file** — Extracts model aliases into a dedicated file, simplifies type definitions, and uses consistent casing throughout. [PR #5375](https://github.com/pollinations/pollinations/pull/5375)

