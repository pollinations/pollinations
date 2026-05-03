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
- [ ] (3) at least one variant that demonstrates token counting / cost attribution at the bee level — **next**

## Phase A — close gap (3) [~1 session]

Goal: one bee + one surface that returns real `usage` from a real model call. Unblocks billing design on #10628.

- [ ] **A1.** `bees/catgpt/core/usage.ts` — pure helper. `recordUsage({prompt_tokens, completion_tokens, model})` → `{...input, cost_pollen}`. Lookup table for `claude-fast`/`claude-sonnet-4-6` against shared/registry pricing. No I/O.
- [ ] **A2.** `core/usage.test.ts` — pricing math, cost rounding, unknown-model fallback. ~5 tests.
- [ ] **A3.** `core/reply.ts` — return `{text, usage}` instead of just `text`. Update existing callers (only `vanilla` and the surfaces that touch reply directly).
- [ ] **A4.** `surfaces/openai-compat/handler.ts` — populate `usage` field on the response (already part of OpenAI shape — currently absent).
- [ ] **A5.** `surfaces/web-chat/handler.ts` — emit a `usage` SSE event before `done`.
- [ ] **A6.** `surfaces/a2a/handler.ts` — add `{usage}` to the `data` part of the agent's reply.
- [ ] **A7.** Update `core/live.test.ts` — assert `usage.prompt_tokens > 0` and `usage.completion_tokens > 0` from the real API.
- [ ] **A8.** Run smoke + biome. Commit. Push. Post `[claude-code]` update on #10628 marking gap (3) closed.

**Verification:** `bash bees/catgpt/scripts/smoke.sh` shows ≥45 tests pass. `POLLINATIONS_LIVE=1 ... node --test core/live.test.ts` returns non-zero usage numbers.

## Phase B — second worker bee that isn't catgpt-shaped [~½ session]

Goal: validate the manifest + surface adapters work for a non-chat bee.

- [ ] **B1.** `bees/echo-bee/` — minimal worker bee. Manifest, `core/echo.ts` (pure: `(input) => input.toUpperCase()`), tests. Demonstrates the floor: what's the smallest bee the platform can host?
- [ ] **B2.** Mount the existing `surfaces/openai-compat` adapter (from `bees/catgpt/surfaces/openai-compat/`) on echo-bee. Proves surfaces port across bees, not just across variants of one bee.
- [ ] **B3.** `bees/echo-bee/manifest.test.ts`, runs through `validateManifest` from catgpt's manifest module.
- [ ] **B4.** Lift the openai-compat surface to a shared location? Decide based on what the import path looks like — if echo-bee importing from `../catgpt/surfaces/...` feels wrong, move to `bees/_surfaces/`. Otherwise keep colocated.

**Verification:** echo-bee tests pass standalone; catgpt tests still pass.

## Phase C — code-bee finish line [~½ session]

Goal: round out the container reference so it isn't just a runner skeleton.

- [ ] **C1.** `bees/code-bee/surfaces/cli/main.ts` — `node main.ts "<prompt>" --cwd /tmp/sess1`. Mirrors catgpt's CLI.
- [ ] **C2.** `bees/code-bee/surfaces/openai-compat/handler.ts` — adapts the SDK's async generator to a Chat Completions response. The translation is non-trivial (tool events → OpenAI doesn't have an equivalent); document the mapping decisions inline.
- [ ] **C3.** `bees/code-bee/manifest.ts` — add `openai` and `cli` to surfaces.
- [ ] **C4.** Defer live test for code-bee — needs the SDK installed in CI; violates the install-free constraint. Note in README and skip.

**Verification:** code-bee tests reach ~16-18, all install-free.

## Phase D — landing-pad docs [~¼ session]

Goal: make the PR readable for review, give #10628 a single artifact to point at.

- [ ] **D1.** `bees/README.md` — top-level index. Explains the directory shape, lists each bee with one-line description, links to per-bee READMEs. Mention the `_surfaces/` split if Phase B chose to lift them.
- [ ] **D2.** `bees/COMPARISON.md` — bird's-eye comparison: catgpt vs code-bee on runtime kind, surfaces, state backend, LOC, install footprint. One table. Not per-variant — that lives in catgpt's README.
- [ ] **D3.** Update PR #10630 description with the current state and a link to `bees/PLAN.md` and `bees/COMPARISON.md`.

**Verification:** rendering on github looks right; links resolve.

## Explicitly NOT doing

- More CatGPT variants (effect-ts, koa, fastify). Diminishing returns confirmed by hono/bun/deno collapsing to the same shape.
- Building a parallel deploy API to codex's. They're already on it; better to merge once they land.
- Designing billing in detail before A is done. Premature.
- Refactoring existing variants. Working tree is clean, leave it.

## How to follow this plan

Tasks are ordered by dependency. A → B → C → D. Within a phase, items are mostly serial; A1-A2 must happen before A3-A6.

Update this file as items land — flip `[ ]` to `[x]`, add commit SHA next to phase headers when each phase closes. The file is the running record; commit messages reference phase IDs (e.g. "experiment(bees/catgpt): A1+A2 — usage helper + tests").
