# Agent Guidelines for pollinations.ai

## App Submission Handling

Two-phase review via `app-review-submission.yml` (AI + human). Source of truth: `apps/APPS.md`.

Flow: user opens issue with `TIER-APP` → workflow validates + AI generates preview → bot posts `APP_REVIEW_DATA` JSON + labels `TIER-APP-REVIEW` → maintainer adds `TIER-APP-APPROVED` → workflow prepends row to `apps/APPS.md`, opens PR with auto-merge, closes issue via `Fixes #NNN`.

Label state machine:
- `TIER-APP` → `TIER-APP-REJECTED` (duplicate/spore) | `TIER-APP-INCOMPLETE` (not registered) | `TIER-APP-REVIEW` → `TIER-APP-APPROVED` (merged) | `TIER-APP-REJECTED` (closed)

Manual edits: edit `apps/APPS.md`, run `node .github/scripts/app-update-readme.js`.

APPS.md columns: `Emoji | Name | Web_URL | Description (~80 chars) | Language (ISO code, no flags) | Category | Platform | GitHub (@user) | GitHub_ID | Repo | Stars (⭐N) | Discord | Other | Submitted_Date (issue created) | Issue_URL (#N) | Approved_Date (PR merged)`.

Platforms (auto-detected; comma-separated for multi): `web` (default w/ URL), `android`, `ios` (App Store or routinehub.co), `windows`, `macos`, `desktop` (cross-platform), `cli`, `discord`, `telegram`, `whatsapp`, `library` (npm/PyPI/SDK), `browser-ext`, `roblox`, `wordpress`, `api` (default w/o URL).

Categories: `image`, `video_audio`, `writing`, `chat`, `games`, `learn`, `bots`, `build`, `business`.

## Discord

Guild ID `885844321461485618` (https://discord.gg/pollinations-ai-885844321461485618) — use for Discord MCP tools.

## Repository Structure

- `enter.pollinations.ai/` — Auth gateway + billing (Cloudflare Worker)
- `gen.pollinations.ai/` — Edge router → enter gateway
- `image.pollinations.ai/` — Image backend (EC2 + Vast.ai)
- `text.pollinations.ai/` — Text backend (EC2)
- `pollinations.ai/` — React frontend
- `packages/sdk/` — `@pollinations_ai/sdk` (client + React hooks)
- `packages/mcp/` — `@pollinations_ai/model-context-protocol` (MCP server; see `packages/mcp/AGENTS.md`)
- `packages/skills/` — Shared agent-agnostic skills (SKILL.md format). Consumable by any harness; symlinked back into `.claude/skills/` for Claude Code. See `packages/skills/README.md`.
- `shared/` — auth, registry, IP queue; `shared/registry/` holds model registries
- `apps/` — Community apps + `APPS.md`
- `social/` — Discord/Reddit/GitHub automation

### Skills

Two homes, one format:

- `packages/skills/` — agent-agnostic skills (wrap public APIs/CLIs, no harness coupling). Any agent that understands `SKILL.md` can use them. Add new general-purpose skills here.
- `.claude/skills/` — Pollinations-internal or Claude-Code-harness-specific skills (tier management, Tinybird deploys, permission tuning, etc.). Also contains symlinks to the shared skills in `packages/skills/` so Claude Code discovers both sets in one place.

When authoring a new skill, ask: does it depend on internal infra/credentials or Claude-Code-only features (hooks, settings.json, keybindings)? If no, put it in `packages/skills/` and symlink into `.claude/skills/`.

## API Gateway

Primary: `https://gen.pollinations.ai` → routes to `enter.pollinations.ai` for auth/billing.

- Auth: `pk_` (frontend), `sk_` (backend). Keys: https://enter.pollinations.ai
- Billing: Pollen credits ($1 ≈ 1 Pollen). Full docs: `./APIDOCS.md`
- Services: Text (Portkey, multi-provider), Image (Flux/Turbo on EC2/Vast.ai/io.net), Video (Wan/Veo/LTX), Audio (ElevenLabs, TTM)
- Tiers: microbe → spore → seed → flower → router (nectar is legacy — still supported, no longer granted; see `enter.pollinations.ai/src/tier-config.ts`)

### Local Development

Ports: enter `3000` (API at `/api/*`), text `16385`, image `16384`. Run `npm run dev` per service.

To point enter at local backends, edit `enter.pollinations.ai/wrangler.toml` `IMAGE_SERVICE_URL`/`TEXT_SERVICE_URL` to `http://localhost:1638[45]`. EC2 hostnames in wrangler.toml may change — check actual values.

Local API test:
```bash
curl "http://localhost:3000/api/generate/image/test?model=flux" -H "Authorization: Bearer $TOKEN"
curl "http://localhost:3000/api/generate/v1/chat/completions" -H "Authorization: Bearer $TOKEN" ...
```

## API Quick Reference

- Image: `GET gen.pollinations.ai/image/{prompt}` (bearer token)
- Text (OpenAI): `POST gen.pollinations.ai/v1/chat/completions` with `{model, messages}` (bearer token)
- Simple text: `GET gen.pollinations.ai/text/{prompt}?key=...`
- Audio: `GET gen.pollinations.ai/audio/{text}?voice=nova&key=...`
- Models: `/image/models`, `/v1/models`
- See `./APIDOCS.md`, `.claude/skills/enter-services/SKILL.md`

## ⚠️ YAGNI — You Aren't Gonna Need It (CRITICAL)

**Follow YAGNI religiously:**

- Only implement what's needed now. Remove unused functions.
- No speculative abstractions, "just in case" helpers, preemptive test utils/wrappers.
- No backward-compat fallbacks — clean breaks beat bloat. When changing tokens/headers/APIs, update all consumers at once.
- When user says "keep it simple" — one function, one price, one config. Simplest thing that works.

## Tinybird Deployment Safety

**CRITICAL — These rules apply whenever deploying to Tinybird:**

- Validate first: `tb --cloud deploy --check --wait`
- Never `--allow-destructive-operations` without explicit permission
- Never `tb push` (deprecated); use `tb --cloud deploy --wait`
- Always `--cloud` (otherwise CLI hits Tinybird Local/Docker)
- Run from `enter.pollinations.ai/observability`
- Pipes are shared — verify all consumers before modifying any pipe
- Timeouts: use `uniq()` not `uniqExact()`; avoid CTE+JOIN; single-pass queries; for large time ranges use `start_date` parameter week-by-week
- Full procedure: `.claude/skills/tinybird-deploy/SKILL.md`

## Code Style & Workflow

- Modern JS/TS, ES modules (all `.js` are ESM). Follow existing formatting. Comment complex logic.
- Run `npx biome check --write <file>` after edits and before commits.
- Before implementing: verify assumptions on web (APIs change), read related files, check related PRs/issues, check existing utilities in `shared/` before writing new ones (auth, queue, registry, SSE parsing, retry wrappers), confirm branch via `git branch --show-current`.
- When continuing prior work: read relevant code first; identify clear next steps.
- Don't reimplement existing logic — search first.

## Common Mistakes to Avoid

**IMPORTANT — Agents often make these mistakes (learned from session history):**

- Don't use `cd` in bash; use `cwd` parameter.
- Don't run `pytest`; use `npm run test` or `npx vitest run`.
- Don't create `.md` docs unless asked.
- Always use absolute paths.
- Don't edit files manually during a Claude Code session (busts cache).
- Don't run `/compact` unless necessary (busts cache).
- Don't let searches run wild — use targeted paths.
- Don't modify test files to make tests pass — fix the code.
- Run `npm run decrypt-vars` before tests in enter.pollinations.ai.
- Test API keys in `enter.pollinations.ai/.testingtokens`.
- Request PR reviews by including lowercase `polly` in a PR comment.

## Testing

Commands:
- enter.pollinations.ai: `cd enter.pollinations.ai && npm run test` (vitest + CF Workers pool)
- image.pollinations.ai: `cd image.pollinations.ai && npm run test` (vitest)
- text.pollinations.ai: no runner yet

Run individually — full suite is slow:
```bash
npx vitest run --testNamePattern="name"
npx vitest run test/file.test.ts
```

- Test real code, not mocks — use direct imports. Don't create mock infrastructure.
- Read existing tests before adding; prefer extending existing files; follow existing conventions.
- Snapshots (enter): VCR-style, replayed by default. `TEST_VCR_MODE=record` to record; default `replay-or-record`.
- `.testingtokens` contains: `ENTER_API_TOKEN_LOCAL`, `ENTER_API_TOKEN_REMOTE`, `ENTER_TOKEN`, `GITHUB_TOKEN`, `POLAR_ACCESS_TOKEN`.
- Production API tests should hit `gen.pollinations.ai`.

## Architecture & Common Tasks

- Frontend → `pollinations.ai/`; image → `image.pollinations.ai/`; text → `text.pollinations.ai/`; SDK/React → `packages/sdk/`; MCP → `packages/mcp/`.
- Text models: add config in `text.pollinations.ai/configs/modelConfigs.ts`, entry in `availableModels.ts`. Provider configs (Portkey/Bedrock/OpenAI-compat) in `text.pollinations.ai/configs/providerConfigs.js`.
- Image models: handler in `image.pollinations.ai/src/`, register in `shared/registry/image.ts`.
- Update API docs + model registry for new models.
- API changes: maintain backward compatibility; document; handle errors.
- API docs: strictly technical, no marketing; link dynamic endpoints (e.g. `/models`) vs hardcoded lists; no internal impl/env vars; minimal examples for both simplified and OpenAI-compatible endpoints.
- Security: never expose keys/secrets; use env vars; validate input.
- Temp scratch files go in `temp/` clearly labeled.

## Workflow Orchestration

- Plan mode for any non-trivial task (3+ steps or architectural). If things go sideways, STOP and re-plan. Write specs upfront.
- Use subagents liberally for research, exploration, parallel analysis — one task per subagent.
- After user correction: propose an AGENTS.md update capturing the pattern; iterate until mistake rate drops.
- Never mark complete without proving it works — run tests, check logs, diff vs main when relevant.
- Non-trivial changes: ask "is there a more elegant way?" If fix feels hacky, redo elegantly. Skip for obvious fixes.
- Bug reports: just fix them — point at logs/errors/failing tests and resolve. Fix failing CI without being asked how.

## Task Management

1. Plan first (todos or plan mode). 2. Verify plan before implementing. 3. Track progress. 4. Summarize changes. 5. Capture lessons in AGENTS.md.

## Compact Instructions

Preserve during compaction: modified files + line numbers, all code/diffs/impl details, test output + errors + command results, full plan + progress + pending, user preferences/corrections this session, architectural decisions + rationale.

## Core Principles

- Simplicity first — minimal code impact.
- No laziness — find root causes, no temp fixes, senior standards.
- Minimal impact — touch only what's necessary.

## Git Workflow

- "send to git" = git status, diff, branch, commit all, push, PR description.
- Verify branch: `git branch --show-current` and confirm if unsure (branch mix-ups are a recurring mistake).
- Avoid force pushes (`--force`, `--force-with-lease`) — prefer follow-up commits.
- Run biome check before committing.
- If PR already merged: open a new branch/PR for follow-ups.

## Communication Style

Be concise. PRs/comments/issues: bullets, <200 words, no fluff.

- PRs: "- Adds X", "- Fix Y"; 3-5 bullets; titles "fix:"/"feat:"/"Add"; no marketing.
- Issue comments: bullets only; facts not opinions; link code; be direct (no "I think"/"maybe").
- Code reviews: focus on what needs improving; link specific lines; don't praise fine code or repeat obvious things.

## GitHub Labels

Only use established labels (check with `mcp1_list_issues`). Don't create new labels ad-hoc; keep names consistent.

## Contributor Attribution

Commit format:
```
feat: add feature

Co-authored-by: username <user_id+username@users.noreply.github.com>
Fixes #issue
```

- Use "Fixes #issue" or "Addresses #issue" in PRs.
- Email: `{username} <{user_id}+{username}@users.noreply.github.com>` (user_id from issue API).
