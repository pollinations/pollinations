# Agent Guidelines for pollinations.ai

## App Submission Handling

Two-phase review via `app-review-submission.yml` (AI + human). Source of truth: `apps/APPS.md`.

Flow: user opens issue with `TIER-APP` → workflow validates + AI generates preview → bot posts `APP_REVIEW_DATA` JSON + labels `TIER-APP-REVIEW` → maintainer adds `TIER-APP-APPROVED` → workflow prepends row to `apps/APPS.md`, opens PR with auto-merge, closes issue via `Fixes #NNN`.

Label state machine:
- `TIER-APP` → `TIER-APP-REJECTED` (duplicate/invalid) | `TIER-APP-INCOMPLETE` (not registered) | `TIER-APP-REVIEW` → `TIER-APP-APPROVED` (merged) | `TIER-APP-REJECTED` (closed)

Manual edits: edit `apps/APPS.md`, run `node .github/scripts/app-update-greenhouse.js`.

APPS.md columns: `Emoji | Name | Web_URL | Description (~80 chars) | Language (ISO code, no flags) | Category | Platform | GitHub (@user) | GitHub_ID | Repo | Stars (⭐N) | Discord | Other | Submitted_Date (issue created) | Issue_URL (#N) | Approved_Date (PR merged)`.

Platforms (auto-detected; comma-separated for multi): `web` (default w/ URL), `android`, `ios` (App Store or routinehub.co), `windows`, `macos`, `desktop` (cross-platform), `cli`, `discord`, `telegram`, `whatsapp`, `library` (npm/PyPI/SDK), `browser-ext`, `roblox`, `wordpress`, `api` (default w/o URL).

Categories: `image`, `video_audio`, `writing`, `chat`, `games`, `learn`, `bots`, `build`, `business`.

## Discord

Guild ID `885844321461485618` (https://discord.gg/pollinations-ai-885844321461485618) — use for Discord MCP tools.

## Repository Structure

- `enter.pollinations.ai/` — Auth gateway + billing (Cloudflare Worker)
- `gen.pollinations.ai/` — Edge router + text generation Worker
- `image.pollinations.ai/` — Image GPU/backend assets; public gateway code lives in `gen.pollinations.ai/`
- `pollinations.ai/` — React frontend
- `packages/sdk/` — `@pollinations/sdk` (client + React hooks)
- `packages/mcp/` — `@pollinations/mcp` (MCP server; see `packages/mcp/AGENTS.md`)
- `shared/` — auth, registry, IP queue; `shared/registry/` holds model registries
- `apps/` — Community apps + `APPS.md`
- `social/` — Discord/Reddit/GitHub automation

## API Gateway

Primary: `https://gen.pollinations.ai` → routes to `enter.pollinations.ai` for auth/billing.

- Auth: `pk_` (frontend), `sk_` (backend). Keys: https://enter.pollinations.ai
- Billing: Pollen credits ($1 ≈ 1 Pollen). Full docs: `./APIDOCS.md`
- Pack checkout: Stripe. Polar is retired from runtime; keep its concise
  historical/read-only query notes in
  `.claude/skills/provider-billing/providers/polar.md`, but do not add Polar
  SDKs, Worker bindings, webhooks, or automated writes.
- Services: Text (Portkey, multi-provider), Image (gen Worker dispatch to providers/GPU backends), Video (Wan/Veo/LTX), Audio (ElevenLabs, TTM)
- Wallet: Pollen is earned by completing Quests; balances live in the `tier_balance` (shown as Quest Pollen) and `pack_balance` (Paid) buckets. The legacy `tier` D1 column and `tier_balance` wire name are kept for compatibility; see `shared/db/better-auth.ts`.

### Local Development

Ports: enter `3000` (API at `/api/*`), gen `8788`. Run `npm run dev` per service.

Image generation now runs inside `gen.pollinations.ai`; local image API tests should target the gen worker on port `8788`.

Local API test:
```bash
curl "http://localhost:8788/image/test?model=flux" -H "Authorization: Bearer $TOKEN"
curl "http://localhost:8788/v1/chat/completions" -H "Authorization: Bearer $TOKEN" ...
```

See `./APIDOCS.md` for endpoints and `.claude/skills/enter-services/SKILL.md` for service workflows.

## YAGNI

Implement only what the current task needs:

- Only implement what's needed now. Remove unused functions.
- No speculative abstractions, "just in case" helpers, preemptive test utils/wrappers.
- Avoid speculative compatibility layers. Preserve public API compatibility unless the task explicitly approves a coordinated breaking change.
- When user says "keep it simple" — one function, one price, one config. Simplest thing that works.

## Tinybird Deployment Safety

- Work from `enter.pollinations.ai/observability` with the Forward CLI, `--cloud`, the explicit Europe West host, and the correct workspace token.
- Validate and deploy to staging first. Deploy to production only when requested.
- Never use destructive operations, `tb push`, `--auto`, or promotion without explicit permission.
- Stop if validation reports datasource or pipe deletion.
- Pipes are workspace-local; verify consumers in each workspace.
- Follow `.claude/skills/tinybird-deploy/SKILL.md` for commands and query constraints.

## Code Style & Workflow

- Modern JS/TS, ES modules (all `.js` are ESM). Follow existing formatting. Comment complex logic.
- Run `npx biome check --write <file>` after edits and before commits.
- Before editing, inspect related code, search existing utilities in `shared/`, confirm the branch, and verify unstable external APIs against primary documentation when relevant.
- When continuing prior work: read relevant code first; identify clear next steps.
- Don't reimplement existing logic — search first.

## Common Mistakes to Avoid

**IMPORTANT — Agents often make these mistakes (learned from session history):**

- Don't use `cd` in bash; use `cwd` parameter.
- Don't run `pytest`; use `npm run test` or `npx vitest run`.
- Don't create `.md` docs unless asked.
- Always use absolute paths.
- Don't let searches run wild — use targeted paths.
- Don't modify test files to make tests pass — fix the code.
- Run `npm run decrypt-vars` before tests in enter.pollinations.ai.
- Test API keys in `enter.pollinations.ai/.testingtokens`.
- Request PR reviews by including lowercase `polly` in a PR comment.

## Testing

Run `npm run test` with the working directory set to `enter.pollinations.ai/`, `gen.pollinations.ai/`, or `image.pollinations.ai/`.

Run individually — full suite is slow:
```bash
npx vitest run --testNamePattern="name"
npx vitest run test/file.test.ts
```

- Test real code, not mocks — use direct imports. Don't create mock infrastructure.
- Read existing tests before adding; prefer extending existing files; follow existing conventions.
- Snapshots (enter): VCR-style, replayed by default. `TEST_VCR_MODE=record` to record; default `replay-or-record`.
- Local or CI setups may provide `enter.pollinations.ai/.testingtokens`; never commit it.
- Production API tests should hit `gen.pollinations.ai`.

## Architecture & Common Tasks

- Frontend → `pollinations.ai/`; image/text/gen gateway → `gen.pollinations.ai/`; image GPU backends → `image.pollinations.ai/`; SDK/React → `packages/sdk/`; MCP → `packages/mcp/`.
- Text models: add config in `gen.pollinations.ai/src/text/configs/modelConfigs.ts`, entry in `gen.pollinations.ai/src/text/availableModels.ts`. Provider configs (Portkey/Bedrock/OpenAI-compat) in `gen.pollinations.ai/src/text/configs/providerConfigs.ts`.
- Image models: handler in `gen.pollinations.ai/src/image/`, register in `shared/registry/image.ts`.
- Update API docs + model registry for new models.
- API changes: maintain backward compatibility; document; handle errors.
- API docs: strictly technical, no marketing; link dynamic endpoints (e.g. `/models`) vs hardcoded lists; no internal impl/env vars; minimal examples for both simplified and OpenAI-compatible endpoints.
- Security: never expose keys/secrets; use env vars; validate input.
- Temp scratch files go in `temp/` clearly labeled.

## Workflow Orchestration

- Plan mode for any non-trivial task (3+ steps or architectural). If things go sideways, STOP and re-plan. Write specs upfront.
- Use subagents liberally for research, exploration, parallel analysis — one task per subagent.
- Propose an AGENTS.md change only for a durable, repeated repository-specific failure mode.
- Never mark complete without proving it works — run tests, check logs, diff vs main when relevant.
- Non-trivial changes: ask "is there a more elegant way?" If fix feels hacky, redo elegantly. Skip for obvious fixes.
- Bug reports: just fix them — point at logs/errors/failing tests and resolve. Fix failing CI without being asked how.

## Compact Instructions

Preserve during compaction: modified files + line numbers, all code/diffs/impl details, test output + errors + command results, full plan + progress + pending, user preferences/corrections this session, architectural decisions + rationale.

## Git Workflow

- "send to git" = git status, diff, branch, commit all, push, PR description.
- Verify branch: `git branch --show-current` and confirm if unsure (branch mix-ups are a recurring mistake).
- Avoid force pushes (`--force`, `--force-with-lease`) — prefer follow-up commits.
- Run `npx biome check --write <file>` on changed supported files before committing.
- If PR already merged: open a new branch/PR for follow-ups.

## Communication Style

Be concise. PRs/comments/issues: bullets, <200 words, no fluff.

- PRs: "- Adds X", "- Fix Y"; 3-5 bullets; titles "fix:"/"feat:"/"Add"; no marketing.
- Issue comments: bullets only; facts not opinions; link code; be direct (no "I think"/"maybe").
- Code reviews: focus on what needs improving; link specific lines; don't praise fine code or repeat obvious things.

## GitHub Labels

Check existing repository labels before applying one. Do not create labels ad hoc.

## Contributor Attribution

Commit format:
```
feat: add feature

Co-authored-by: username <user_id+username@users.noreply.github.com>
Fixes #issue
```

- Use "Fixes #issue" or "Addresses #issue" in PRs.
- Email: `{username} <{user_id}+{username}@users.noreply.github.com>` (user_id from issue API).
