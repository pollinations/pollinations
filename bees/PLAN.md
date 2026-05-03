# bees/ work plan

Tracking work on the experiment branch (`experiment/catgpt-agent-frameworks`, PR #10630). Source of truth for what's done, in progress, and next. Update as items land.

Coordination with codex happens on issue #10628. They post `[codex]`, we post `[claude-code]`.

## Current state (commit `a37464fb5`)

- `bees/catgpt/` — 12 framework variants, 4 surfaces (cli, openai-compat, a2a, web-chat), 40/40 tests
- `bees/code-bee/` — container reference with Claude Agent SDK, 12/12 tests
- Manifest collapsed to `runtime.kind: "worker" | "container"`, `state.backend: "memory" | "kv" | "durable-object" | "sqlite"`
- Live integration test exists for catgpt (gated on `POLLINATIONS_LIVE=1` + token)

## Critical-mass criteria (codex)

- [x] (1) at least one variant per execution target (Node/Hono, Bun, Deno, CF Workers)
- [x] (2) at least one variant per surface type (HTTP, SSE, A2A, Discord)
- [x] (3) at least one variant that demonstrates token counting / cost attribution at the bee level — **closed in Phase A**

## Phase A — close gap (3) [DONE — commits e19e007c0 + a88be67f4]

Goal: one bee + one surface that returns real `usage` from a real model call. Unblocks billing design on #10628.

- [x] **A1.** `bees/catgpt/core/usage.ts` — `recordUsage` + `coerceOpenAIUsage`. Pure, install-free.
- [x] **A2.** `core/usage.test.ts` — 8 tests covering pricing math, aliases, unknown-model fallback, OpenAI-shape coercion.
- [x] **A3.** `core/reply.ts` — added `generateCatReplyWithUsage` returning `{text, usage}`. Kept `generateCatReply` as a thin wrapper so existing variants don't break.
- [x] **A4.** `surfaces/openai-compat/handler.ts` — populated `usage` field with cost-attribution fields (cost_pollen, cost_dollars, cost_model, cost_estimated). Streaming emits a final usage chunk matching OpenAI's `stream_options.include_usage` shape.
- [x] **A5.** `surfaces/web-chat/handler.ts` — emits a `usage` SSE event before `done`. Non-streaming returns `{reply, comicUrl, usage}`.
- [x] **A6.** `surfaces/a2a/handler.ts` — `data` part of the reply now includes `{comic_url, usage}`.
- [x] **A7.** `core/live.test.ts` — new test asserts `usage.prompt_tokens > 0`, `usage.completion_tokens > 0`, `usage.cost_pollen > 0`, `usage.estimated == false`. Verified against real API: 273+19 tokens = 0.000405 pollen.
- [x] **A8.** Smoke + biome clean. Commit. Push. Post `[claude-code]` update.

**Verification:** `bash bees/catgpt/scripts/smoke.sh` shows ≥45 tests pass. `POLLINATIONS_LIVE=1 ... node --test core/live.test.ts` returns non-zero usage numbers.

## Phase B — DROPPED (codex overlap)

Goal *was*: validate the manifest + surface adapters work for a non-chat bee via a minimal echo-bee.

**Dropped 2026-05-03 after reviewing codex's PR #10636 file tree.** Codex already published `bees/minimal-cloudflare-agents/`, `bees/minimal-daytona-container/`, `bees/minimal-aws-agentcore/` — three minimal worker bees. Adding our own minimal bee on top would duplicate. The minimal-bee territory is theirs; we keep CatGPT (richest variant matrix) and code-bee (only container reference with the Claude Agent SDK).

## Phase C — code-bee finish line [in progress]

Goal: round out the container reference so it isn't just a runner skeleton. This is the unique-value phase — codex has no `code-bee` equivalent, so everything here lands cleanly.

- [x] **C1.** `bees/code-bee/surfaces/cli/main.ts` — `node main.ts "<prompt>" --cwd <path>`. Dynamic-imports `@anthropic-ai/claude-agent-sdk` so the file parses install-free; runs end-to-end once the SDK is installed.
- [ ] **C2.** `bees/code-bee/surfaces/openai-compat/handler.ts` — adapts the SDK's async generator to a Chat Completions response. The translation is non-trivial (tool events → OpenAI has no equivalent); document the mapping inline.
- [x] **C3.** `bees/code-bee/manifest.ts` — added `cli` to surfaces (`openai` will land with C2).
- [ ] **C4.** Defer live test for code-bee — needs the SDK installed in CI; violates the install-free constraint. Note in README and skip.
- [x] **C5.** `bees/code-bee/scripts/smoke.sh` — same shape as catgpt's; auto-discovers tests + parse-checks all *.ts.

**Verification:** code-bee tests reach 12 (cli is run-only, not unit-tested — the unit testable bits live in runner.ts already). All install-free.

## Phase D — landing-pad docs [scope reduced — codex overlap]

Goal: make the PR readable for review, give #10628 a single artifact to point at.

- [ ] ~~**D1.** `bees/README.md`~~ — DROPPED. Codex already published `bees/README.md` and `bees/api-scopes-billing.md` in #10636. Top-level docs are theirs. We will add a per-bee README pointer if needed at merge time.
- [ ] **D2.** `bees/COMPARISON.md` — bird's-eye comparison: catgpt (12 framework variants × 4 surfaces) vs code-bee (container + SDK). Cross-PR comparison once #10636 merges. Defer.
- [ ] **D3.** Update PR #10630 description with current state and a link to `bees/PLAN.md`. Cheap, do soon.

**Verification:** rendering on github looks right; links resolve.

## Explicitly NOT doing

- More CatGPT variants (effect-ts, koa, fastify). Diminishing returns confirmed by hono/bun/deno collapsing to the same shape.
- Building a parallel deploy API to codex's. They're already on it; better to merge once they land.
- Designing billing in detail before A is done. Premature.
- Refactoring existing variants. Working tree is clean, leave it.

## How to follow this plan

Tasks are ordered by dependency. A → B → C → D. Within a phase, items are mostly serial; A1-A2 must happen before A3-A6.

Update this file as items land — flip `[ ]` to `[x]`, add commit SHA next to phase headers when each phase closes. The file is the running record; commit messages reference phase IDs (e.g. "experiment(bees/catgpt): A1+A2 — usage helper + tests").
