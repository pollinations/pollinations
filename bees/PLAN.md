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

## Phase C — code-bee finish line [DONE — commit pending]

Goal: round out the container reference so it isn't just a runner skeleton. This is the unique-value phase — codex has no `code-bee` equivalent, so everything here lands cleanly.

- [x] **C1.** `bees/code-bee/surfaces/cli/main.ts` — `node main.ts "<prompt>" --cwd <path>`. Dynamic-imports `@anthropic-ai/claude-agent-sdk` so the file parses install-free; runs end-to-end once the SDK is installed.
- [x] **C2.** `bees/code-bee/surfaces/openai-compat/handler.ts` — adapts the SDK's async generator to a Chat Completions response. Mapping decisions documented in handler header + README. Streaming diffs deltas to avoid cumulative duplication; tool events project to a non-standard `code_bee` extension; `finish_reason: "length"` when `maxTurns` hits. Usage block is `cost_estimated: true` (agent-loop bees bill per container-second, not per token). 8 unit tests via DI.
- [x] **C3.** `bees/code-bee/manifest.ts` — `surfaces: ["web", "cli", "rest", "openai"]`.
- [x] **C4.** No live test for code-bee — running the real `query()` would require installing `@anthropic-ai/claude-agent-sdk` (4MB + transitive), which violates the install-free smoke constraint shared with catgpt. Documented in README; the runner is unit-tested via DI with a fake `query()` instead.
- [x] **C5.** `bees/code-bee/scripts/smoke.sh` — same shape as catgpt's; auto-discovers tests + parse-checks all *.ts.

**Verification:** code-bee tests reach 20 (12 + 8 openai-compat). 9 .ts files parse-clean. All install-free.

## Phase D — landing-pad docs [scope reduced — codex overlap]

Goal: make the PR readable for review, give #10628 a single artifact to point at.

- [ ] ~~**D1.** `bees/README.md`~~ — DROPPED. Codex already published `bees/README.md` and `bees/api-scopes-billing.md` in #10636. Top-level docs are theirs. We will add a per-bee README pointer if needed at merge time.
- [ ] **D2.** `bees/COMPARISON.md` — bird's-eye comparison: catgpt (12 framework variants × 4 surfaces) vs code-bee (container + SDK). Cross-PR comparison once #10636 merges. Defer.
- [x] **D3.** Updated PR #10630 description with current state, surfaces, test counts, and link to `bees/PLAN.md`.

**Verification:** rendering on github looks right; links resolve.

## Phase K — contract hardening reference on catgpt openai-compat [DONE]

Codex's heartbeat post (issue #10628 ~11:44Z) explicitly asked: "the next useful small slice is contract hardening" and listed: GET / discovery, validate OpenAI bodies + structured 400s, validate hosted `{id}`, decide stream:true. That maps 1:1 to friction-research items B3, B5, B6. Demonstrated B3 + B5 on our `bees/catgpt/surfaces/openai-compat/handler.ts` so codex has a concrete reference shape to lift, not just prose.

- [x] **K1.** `GET /` and `GET /v1/chat/completions` now return discovery JSON: `{name, description, endpoints, auth, try}` with `try` being a copyable curl. Mirrors B3 — caller pastes URL into browser, sees the curl, copies it. Both paths serve the same doc so OpenAI clients that probe with GET don't get a 405.
- [x] **K2.** Replaced plain-text `"invalid request"` 400/405 bodies with structured `{error: {code, message, hint}}` envelope. Six error codes pinned: `method_not_allowed`, `invalid_json`, `invalid_request`, `missing_messages`, `empty_messages`, `no_user_message`. Each `hint` is a copyable next step, not just an apology — matches B5.
- [x] **K3.** New `no_user_message` 400 fires when caller sends only system/assistant turns. Previously the bee silently produced an empty reply against a non-existent user prompt; now it surfaces the contract violation.
- [x] **K4.** README: documented discovery shape + full error-code table.
- [x] **K5.** 7 new tests + 1 replaced for the structured-error shape: GET / discovery, GET /v1/chat/completions discovery, DELETE → structured 405, malformed JSON → invalid_json, missing/empty/no-user → corresponding codes. catgpt smoke now 64/64 (was 59).

**Why a reference shape, not a cherry-pick PR.** Codex's musician-booking deploy will need its own error envelope decisions. Demonstrating the shape on our experiment branch gives them a concrete `{error: {code, message, hint}}` to copy or improve, with the error-code vocabulary already worked out and tested. No design-by-comment; the code is the spec.

**Verification:** `bash bees/catgpt/scripts/smoke.sh` — 64/64 (+5 new, 1 replaced). Other smokes unchanged: code-bee 20/20, deploy-api 71/71. Total 155 unit tests install-free.

## Phase J — probe new /v1/chat/completions surface [DONE]

After codex shipped commit `eaf18f5f9` ("all bees are OpenAI-compatible agents") + `08708141d` (took the low-risk parts of the friction-research pass: `surfaces: ["openai"]` default in `polli bees init`, `billing.mode: "author-pays"` default, placeholder `pk_replace_me` rejection at validate time). The live deployed worker now serves two new paths. External-observer probe captures both happy path and edge cases.

- [x] **J1.** Probed `/v1/chat/completions` and the hosted projection `/bees/{id}/v1/chat/completions`. Both return canonical OpenAI Chat Completion shape with `metadata.state.turns` extension. Captured as `openai-completions-response.json` and `openai-completions-hosted-path-response.json`.
- [x] **J2.** Edge-case probe revealed concrete contract gaps in the minimal bee (by-design lenience for a reference, but worth pinning):
  - empty body `{}` → 200 (no validation of required `messages`)
  - `stream: true` → returns single non-streamed JSON (caller asking for SSE silently gets regular JSON — the exact bug B6 from the friction research)
  - bogus bearer → 200 (auth not enforced)
  - `/bees/wrong-id/v1/chat/completions` → 200 (hosted projection doesn't validate bee id)
  - `role: "assistant"` user input → 200 with empty content (silently dropped)
- [x] **J3.** Wrote `bees/deploy-api/openai-surface-interop.test.ts` — 5 assertions pinning the canonical shape, the `metadata.state` namespaced extension (matches B2 friction recommendation — single namespaced key, not scattered), the hosted-projection alias relationship, the `usage` absence on minimal bees, and the model-echo behavior.
- [x] **J4.** Updated `probe-summary.md` to three-section Phase H/I/J view.

**Concrete observation worth flagging.** Codex's `metadata.state.turns` extension on `/v1/chat/completions` uses the same single-key namespacing as their A2A `result.metadata.state.turns` — cross-surface consistency. That's the right shape; our catgpt openai-compat handler scatters extras across `usage.cost_pollen` + `message.metadata.comic_url` (two namespaces). A future cherry-pick from us could collapse to match.

**Verification:** `bash bees/deploy-api/scripts/smoke.sh` — 71/71 (was 66, +5 OpenAI surface interop).

## Phase I — re-probe after codex's fix [DONE]

Codex addressed both Phase H findings within ~2 hours of our post (issue #10628 timeline). Re-probed the live worker, captured new fixtures, flipped assertions from "pinning divergence" to "pinning convergence" so any regression breaks loudly. Bumped our `protocolVersion` to match the deployed reference.

- [x] **I1.** Re-probed live worker: `/a2a` now 200 (proper JSON-RPC 2.0 envelope, A2A v0.3.0 message shape), `/web/messages` now 200 (alias of `/message`). Captured `a2a-response.json` and `web-messages-response.json` as new fixtures.
- [x] **I2.** Refreshed `agent-card.json` and `message-response.json` (turn counter at 17, was 5 in Phase H — DO state survived all redeploys).
- [x] **I3.** Updated `probe-summary.md` to two-section format: Phase H historical + Phase I current. The Phase H→I diff is itself the artifact (concrete external-observer evidence drove a real fix).
- [x] **I4.** Rewrote `interop.test.ts`: 7 assertions, now pin convergence instead of bugs. New assertion: A2A response is JSON-RPC 2.0 envelope with `result.message.role: "agent"` + `parts[].kind: "text"` — pins the spec contract so a regression breaks loudly.
- [x] **I5.** Bumped `bees/catgpt/surfaces/a2a/handler.ts` `protocolVersion` from `"0.2.5"` → `"0.3.0"` to match A2A spec + codex's deployed card.

**Remaining gap (next iterable):** our A2A handler returns plain JSON, not JSON-RPC 2.0 envelopes. For spec parity with codex's deployed worker (and with A2A clients in general), wrap responses in `{jsonrpc, id, result: {...}}`.

**Verification:** all three smokes pass — catgpt 59/59 + 3 live, code-bee 20/20, deploy-api 66/66.

## Phase H — live interop probe of codex's deployed worker [DONE — superseded by I]

Codex deployed `minimal-cloudflare-agents-bee` to a real CF Workers URL (per their issue comment). External-observer probe captures what the live worker actually serves vs what codex's deploy-API URL projection promises.

- [x] **H1.** Probed `https://minimal-cloudflare-agents-bee-staging-codex.thomash-efd.workers.dev/`. Captured agent card + /message response as fixtures under `bees/deploy-api/test-fixtures/codex-deployed-cf/`. Documented live results in `probe-summary.md`.
- [x] **H2.** `interop.test.ts` — 7 assertions pinning the divergences: live worker serves `/message` and `/.well-known/agent-card.json` only; `/a2a` (advertised by the card!), `/web/messages` (codex's `routeForSurface` projection), `/v1/chat/completions`, `/`, `/docs` all 404. Our agent-card schema is `protocolVersion: "0.2.5"`; theirs is `"0.3.0"` — we should bump.

**Concrete findings worth flagging at merge time:**
1. **Codex's agent card lies about its A2A endpoint.** Card says `url: ".../a2a"` + `preferredTransport: "JSONRPC"` but `/a2a` returns 404. A2A clients reading the card will fail.
2. **`routeForSurface` projects `/web/messages` and `/a2a`; the worker serves `/message`.** Deploy-API URL contract and bee implementation are out of sync.
3. **DO state persistence works.** Turn counter advances across requests — we observed turns 3 → 4 → 5 across our probe calls.

**Verification:** `bash bees/deploy-api/scripts/smoke.sh` — 66/66 (was 59, +7 interop).

## Phase G — cross-validation against codex's bee.json fixtures [DONE]

Vendored copies of the 4 `bee.json` files codex shipped on PR #10636 (minimal-cloudflare-agents, minimal-daytona-container, minimal-aws-agentcore, musician-booking-reference). Run them through our `validateDeployManifest` and assert the divergences as living test cases.

- [x] **G1.** `bees/deploy-api/test-fixtures/codex-*.json` + `cross-validation.test.ts`. 7 tests document: codex uses `billing.mode` (we use `billing.default`); codex's `init` writes `clientId: "pk_replace_me"` (we reject placeholders); codex uses camelCase `retentionDays` (we use snake_case). Synthetic projection test shows that with a realistic `clientId` and our 5 required fields filled in, codex's `daytona-container` fixture validates cleanly. Refresh procedure documented in test header.

**Why a test, not a comment in COMPARISON.md?** Tests fail loudly when either side moves. If codex renames `billing.mode` → `billing.default` (or we do the reverse), the assertions flip and convergence becomes visible in CI. Concrete merge-time evidence beats prose.

**Verification:** `bash bees/deploy-api/scripts/smoke.sh` — 59/59 (was 52, +7 cross-validation).

## Phase F — independent deploy API reference [DONE]

User asked for a parallel deploy API + CLI to triangulate the design against codex's `bees/customer-deploy-reference/` on PR #10636. F1+F2+F3 done this iteration.

- [x] **F1.** Read codex's deploy reference end-to-end (api.js, cli.js, schema.js, tests, README, api-scopes-billing.md). Captured strengths (dry-run shape, requestedProvider split, source discriminator, per-runtime meters) and gaps (no HTTP handler, no PATCH, status never transitions, no idempotency, placeholder clientIds pass validation, schema duplication with our manifest).
- [x] **F2.** Posted concrete review on #10628 ([comment](https://github.com/pollinations/pollinations/issues/10628#issuecomment-4365902427)).
- [x] **F3.** Built `bees/deploy-api/` — TS, real `Request → Response` HTTP handler, status state machine (`queued → building → ready` with allowed-transition table), `PATCH` works, `409` on duplicate name, placeholder clientId rejection, reuses `validateManifest`/`resolveManifest` from catgpt. 52/52 tests pass.
- [x] **F4.** `bees/COMPARISON.md` — side-by-side: #10630 vs #10636. Schema split, deploy-API split (acknowledges F2 review was specific to `customer-deploy-reference/`, not `musician-booking-reference/src/deploy-api/server.ts`), cherry-pick recommendations matching codex's framing on issue.
- [ ] ~~**F5.** `bees/polli-cli/`~~ — DROPPED. Codex shipped `packages/polli-cli` (commit `87bd2df8b`) with init/validate/deploy/list/status/events/delete. Building a parallel CLI is duplication.

**Verification:** `bash bees/deploy-api/scripts/smoke.sh` shows 52/52 unit tests pass, 8 .ts files parse-clean. Other smokes unchanged: catgpt 59/59 + 3 live, code-bee 20/20.

## Phase E — schema convergence with codex's PR #10636 [DONE]

Goal: keep our manifest validator from drifting from codex's resolver. Codex's commit `98ceda347` made `runtime` optional (defaults to `worker`) and `state.backend` optional (defaults to `sqlite`), and added a `validate` that returns a `resolved` view. Mirror those semantics so a bee.json that validates on their side validates on ours, and vice versa.

- [x] **E1.** `runtime` made optional in `AgentManifest` and `validateManifest`. Missing runtime is no longer an error.
- [x] **E2.** `resolveManifest(m)` added — pure function returning `{resolved, errors}`. Fills `runtime: {kind: "worker"}` and `state.backend: "sqlite"` when absent. Does not mutate input. New `ResolvedAgentManifest` type for the post-resolution dense shape.
- [x] **E3.** 7 new manifest tests: missing runtime accepted, missing state.backend accepted, defaults applied correctly, explicit values preserved, no input mutation, errors match `validateManifest`.

**Verification:** catgpt smoke 59/59 (was 52). All other surfaces and variants unchanged.

## Explicitly NOT doing

- More CatGPT variants (effect-ts, koa, fastify). Diminishing returns confirmed by hono/bun/deno collapsing to the same shape.
- Building a parallel deploy API to codex's. They're already on it; better to merge once they land.
- Designing billing in detail before A is done. Premature.
- Refactoring existing variants. Working tree is clean, leave it.

## How to follow this plan

Tasks are ordered by dependency. A → B → C → D. Within a phase, items are mostly serial; A1-A2 must happen before A3-A6.

Update this file as items land — flip `[ ]` to `[x]`, add commit SHA next to phase headers when each phase closes. The file is the running record; commit messages reference phase IDs (e.g. "experiment(bees/catgpt): A1+A2 — usage helper + tests").
