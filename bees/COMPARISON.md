# bees/ — comparison: PR #10630 vs PR #10636

Two parallel PRs explore the same target (a "deploy your own bee" platform) from opposite ends. This doc helps reviewers decide what to extract from #10630 (the experiment) into #10636 (the deployable path) per codex's cherry-pick recommendation on issue #10628.

## Framing (codex's, accurate)

| | #10630 (this PR) | #10636 (codex) |
|---|---|---|
| Branch | `experiment/catgpt-agent-frameworks` | `codex/musician-booking-agent-reference` |
| Posture | learning/experiment, "not for merge" in PR body | deployable developer path, draft for merge |
| Center of gravity | breadth: same bee implemented many ways | depth: one bee implemented end-to-end with deploy plumbing |

These are complementary, not competing. The experiment establishes which abstractions actually port across runtimes/frameworks; the deployable path proves a customer can deploy on Cloudflare/Daytona/AgentCore today.

## What each PR contains

### #10630 (claude-code) — at a glance

```
bees/
├── catgpt/                   ← worker bee, 12 framework variants × 4 surfaces
│   ├── core/                 ← shared logic (~80 LOC), usage helper, prompt
│   ├── manifest.ts           ← AgentManifest type + validateManifest + resolveManifest
│   ├── implementations/      ← vanilla, hono, bun, deno, cloudflare-agents,
│   │                            openai-agents-sdk, vercel-chat-sdk,
│   │                            pi-agent-core, effect, fastify, koa, express
│   ├── surfaces/             ← cli, openai-compat, a2a, web-chat
│   └── core/live.test.ts     ← real API, gated on POLLINATIONS_LIVE=1
│
├── code-bee/                 ← container bee, Claude Agent SDK
│   ├── manifest.ts           ← runtime.kind: "container", state.backend: "sqlite"
│   ├── src/runner.ts         ← DI runner — query is a function arg, install-free tests
│   └── surfaces/             ← cli, web-chat (SSE), openai-compat
│
├── deploy-api/               ← independent control-plane reference (Phase F)
│   ├── manifest-deploy.ts    ← extends AgentManifest with source/name/clientId/env
│   ├── store.ts              ← state machine: queued → building → ready / failed
│   ├── routes.ts             ← real Request → Response HTTP handler with sk_ auth
│   └── billing.ts            ← per-runtime meters + scope splits
│
└── PLAN.md                   ← running tracker
```

Tests: 131 unit pass install-free (catgpt 59, code-bee 20, deploy-api 52). 3 live (gated).

### #10636 (codex) — at a glance, by file tree only (per "no peeking" directive)

```
bees/
├── README.md
├── api-scopes-billing.md     ← scopes/billing proposal
├── storage-backends.md       ← hot vs cold memory, GitHub-as-archive sketch
├── customer-deploy-reference/← in-memory control-plane sketch (4 files + tests)
├── musician-booking-reference/ ← end-to-end reference: agent + providers + surfaces
│   ├── src/agent.ts, manifest.ts, store.ts
│   ├── src/runtime/{worker.ts, node-server.ts, http.ts}
│   ├── src/surfaces/{openai, web, a2a, discord}.ts
│   ├── src/providers/
│   │   ├── cloudflare/{agents-sdk, durable-object, sql-store, worker}.ts
│   │   ├── daytona/{index, launcher}.ts
│   │   ├── aws/{agentcore, agentcore-server}.ts
│   │   └── enter/byop.ts
│   ├── src/deploy-api/{server, schema, index}.ts  ← real server
│   ├── src/cli.ts
│   └── Dockerfile, Dockerfile.agentcore, wrangler.{toml,agents.toml}
├── minimal-cloudflare-agents/, minimal-daytona-container/,
│   minimal-aws-agentcore/, minimal-frontend/         ← per-provider minimal bees
│
packages/polli-cli/             ← real CLI: init/validate/deploy/list/status/events/delete
└── src/{commands/bees.ts, lib/bees.ts, index.ts}
```

## Where they overlap

| Concept | #10630 | #10636 | Overlap status |
|---|---|---|---|
| Manifest defaults (`runtime` optional → `worker`; `state.backend` optional → `sqlite`) | `bees/catgpt/manifest.ts:resolveManifest` | `customer-deploy-reference/src/schema.js:normalizeBeeManifest` | **Converged** — same defaults, same names, both pure functions |
| Surface abstraction | `bees/catgpt/surfaces/`, `bees/code-bee/surfaces/` | `musician-booking-reference/src/surfaces/` | **Independent implementations**, same `Request → Response` shape |
| Top-level `bees/README.md` | absent (we deferred) | present | **Codex's wins** at merge |
| `bees/api-scopes-billing.md` | absent | present | **Codex's only** |
| Manifest validation | `validateManifest` (TS) | `validateBeeManifest` (JS) | **Two validators** — see schema split below |
| Deploy API HTTP server | `bees/deploy-api/routes.ts` | `musician-booking-reference/src/deploy-api/server.ts` | **Two implementations** — see deploy-API split below |
| Deploy CLI | none (dropped — codex covers) | `packages/polli-cli` | **Codex's only** |

## Schema split (the most consequential difference)

Two manifest formats serve two different jobs, as codex correctly noted on the issue thread:

| | #10630 — registry/runtime authoring | #10636 — customer deployment input |
|---|---|---|
| Type name | `AgentManifest` | `bee.json` |
| Identity | `id` + `display_name` + `description` | `name` |
| Model | required `model: string` (resolves against `shared/registry/text.ts`) | absent (deploy-time concern) |
| State scope | required `state.scope: "none"|"per-agent"|"per-user"` | absent |
| Source | absent (bee is colocated in our refs) | required `source: { type, ... }` discriminator |
| Billing | `default: "user-pays"|"author-pays"` + `per_surface` overrides | `mode`, `clientId`, `dailyPollenLimit` |
| Surfaces | `openai, web, discord, a2a, rest, cli` | `openai, web, discord, a2a` |
| Retention | `retention_days` (snake) | `retentionDays` (camel) |

These don't conflict — they're orthogonal layers. A practical merge could declare:

- `AgentManifest` is the **runtime/registry** type the platform reads to host a bee.
- `bee.json` is the **deploy-time input** the customer hands the platform; the deploy API expands `bee.json` + `source` into a runtime `AgentManifest`.
- The deploy-time validator runs first, then the runtime validator runs on the resolved output.

## Deploy-API split (where I was partly wrong in F2 review)

My F2 review (https://github.com/pollinations/pollinations/issues/10628#issuecomment-4365902427) called out gaps in `customer-deploy-reference/` — no HTTP handler, no PATCH, status never transitions, no idempotency. Those critiques **stand for that directory**.

But codex *also* has `musician-booking-reference/src/deploy-api/server.ts`, which is a real server. The reference design landscape on #10636 is:

- `customer-deploy-reference/` — control-plane *sketch* (in-memory store, no HTTP). The right thing to compare ours against.
- `musician-booking-reference/src/deploy-api/server.ts` — real HTTP server tied to a real bee.
- `packages/polli-cli` — CLI that hits the real API.

Our `bees/deploy-api/` is closer to a **standalone API library** — it's a `Request → Response` handler that doesn't ship as part of any specific bee. That's a different product than `musician-booking-reference/`'s server, which is the deploy plane *for a specific bee*.

| | #10630 `bees/deploy-api/` | #10636 `customer-deploy-reference/` | #10636 `musician-booking-reference/src/deploy-api/server.ts` |
|---|---|---|---|
| Form | `Request → Response` handler factory | class with no HTTP layer | server tied to one bee |
| Auth | `Bearer sk_*` required, rejects `pk_*` | none | unknown (didn't read code per directive) |
| Status state machine | `queued → building → ready/failed`; illegal transitions throw | always `"queued"` | unknown |
| `PATCH /v1/bees/{id}` | implemented | documented only | unknown |
| Idempotency | `409` on duplicate, `?upgrade=1` to update | silent overwrite | unknown |
| Validation | reuses `bees/catgpt/manifest.ts` | duplicates as `validateBeeManifest` | unknown |
| Placeholder client IDs | rejected at validate time | pass | unknown |
| Container bee scope split | adds `bees:exec` separately | doesn't | unknown |
| Tests | 52 (manifest, store, routes, billing) | exists, smaller | exists |

If `musician-booking-reference/src/deploy-api/server.ts` already covers what `bees/deploy-api/` does, the latter is duplicate. If it doesn't (e.g. no real status state machine, no PATCH, no idempotency), then the gaps are extractable as cherry-picks.

## What's worth cherry-picking from #10630 (per codex's recommendation)

In rough order of "this fills a gap and is easy to lift":

1. **`bees/catgpt/core/usage.ts` + threading through surfaces.** Pure helper that returns `{prompt_tokens, completion_tokens, cost_dollars, cost_pollen, estimated}` per turn. Verified against real API: 273+19 tokens = 0.000405 pollen. Closes the "gap (3) cost attribution" criterion codex flagged. Drop-in.
2. **`bees/code-bee/`** as the canonical `container`-runtime reference. The Claude Agent SDK runner with DI lets the test suite stay install-free; the openai-compat surface's mapping table (text → `delta.content`, tool → `code_bee.tool` extension, result → `finish_reason`) is the answer to "how does an agent-loop bee talk Chat Completions."
3. **Surface adapters** (`bees/catgpt/surfaces/{openai-compat,a2a,web-chat,cli}/`). Same `Request → Response` shape, runtime-portable across Node/Bun/Deno. A2A in particular is the only Google-A2A-JSON-RPC implementation in either PR.
4. **`bees/catgpt/manifest.ts:resolveManifest`** — the TS version with explicit `ResolvedAgentManifest` type. Same defaults as codex's normalizer; useful if the registry side wants typed resolution.
5. **Deploy-API gaps from `bees/deploy-api/`** — placeholder-clientId rejection, status state machine with allowed-transition table, `PATCH` semantics, idempotency-via-upgrade-flag, `bees:exec` scope. These are 100-LOC chunks each.
6. **`bees/catgpt/implementations/` framework variants** — only worth lifting if anyone actually wants to compare frameworks side-by-side. Otherwise, the conclusion (frameworks barely matter at this size) is the artifact, not the code.

## What's NOT worth lifting from #10630

- 12 framework variants. Pick 2-3, drop the rest.
- The COMPARISON doc (this file). Lives on the experiment side.
- The 30-min cron scaffolding. Not part of the platform.

## Recommendation

Concur with codex's framing on the issue thread. Land #10636 as the base; cherry-pick (1)-(5) above as small follow-up PRs. Close #10630 once cherry-picks land, or keep it open as a permanent reference.
