# CatGPT — multi-framework experiment

Experimental side-by-side reimplementation of CatGPT (currently `apps/catgpt` web + `apps/catgpt-bot` Discord) across multiple agent runtime frameworks. Mirrors Cassi's `implementations/` pattern.

**Not for merge.** This is a free experimentation PR for the agent platform research in pollinations/pollinations#10628.

## Why

CatGPT is the canonical "one agent, two surfaces" case: identical 6-line system prompt + identical pipeline (`text → cat reply → comic image URL`) duplicated across `apps/catgpt/ai.js` and `apps/catgpt-bot/bot.ts`. Perfect wedge for evaluating agent runtimes.

Each variant implements the **same bee** with the **same surfaces** (web + Discord) using a different framework. We compare LOC, surface coupling, state model, deployment shape.

## Layout

```
bees/catgpt/
├── README.md                              ← this file
├── manifest.ts                            ← strawman AgentManifest (data only)
├── core/                                  ← framework-agnostic pure logic + tests
│   ├── prompt.ts                          ← CAT_SYSTEM, createImagePrompt
│   ├── reply.ts                           ← generateCatReply(question, imageUrl, opts)
│   ├── image.ts                           ← buildComicImageUrl(question, reply, ...)
│   ├── types.ts                           ← shared types
│   └── *.test.ts                          ← node:test, no install required
├── surfaces/                              ← shared surface adapters that any variant can mount
│   ├── cli/                               ← terminal demo (~15 LOC)
│   └── openai-compat/                     ← /v1/chat/completions surface (model: "catgpt")
└── implementations/                       ← same bee, twelve variants
    ├── vanilla/                           ← hand-rolled, baseline
    ├── cloudflare-agents/                 ← cloudflare/agents (DO + SQLite + AIChatAgent)
    ├── openai-agents-sdk/                 ← @openai/agents (TS) hosted-clients pattern
    ├── vercel-chat-sdk/                   ← Vercel AI SDK + chat UI
    ├── pi-agent-core/                     ← pi-agent-core (matches Cassi's pi-ai-runtime)
    ├── anthropic-sdk/                     ← @anthropic-ai/sdk against Pollinations
    ├── mastra/                            ← Mastra agent framework
    ├── langchain/                         ← LangChain.js ChatOpenAI
    ├── llamaindex/                        ← LlamaIndex.TS LLM
    ├── hono/                              ← Hono web framework, mounts every surface
    ├── bun/                               ← Bun.serve native, no framework
    └── deno/                              ← Deno.serve native, no framework
```

## Same bee, every variant

```ts
// the whole bee: a few pure functions + config
import { generateCatReply, buildComicImageUrl } from "../core/index.ts";

export async function catgpt(question: string, imageUrl?: string, apiKey?: string) {
  const reply = await generateCatReply(question, imageUrl ?? null, { apiKey });
  return { reply, comicUrl: buildComicImageUrl(question, reply, imageUrl ?? null, { apiKey }) };
}
```

Each `implementations/<name>/` exposes the same shape:

```
implementations/<name>/
├── README.md           ← what this variant is, how to run, what we learned
├── package.json
├── src/
│   ├── agent.ts        ← bee definition in this framework's idiom
│   ├── web.ts          ← web/HTTP surface adapter
│   └── discord.ts      ← Discord surface adapter
└── ...framework-specific files
```

## Comparison table

| Variant | LOC (agent) | LOC (web) | LOC (discord) | State | Notable |
|---|---|---|---|---|---|
| `vanilla` | 24 | 29 | 64 | none | hand-rolled baseline; no SDK overhead |
| `cloudflare-agents` | 44 | 11 (worker) | 57 | DO + SQLite | first-party stateful; class required by DO |
| `openai-agents-sdk` | 73 | 25 | 60 | SDK has slot | tool-calling, hosted-clients for sandboxes |
| `vercel-chat-sdk` | 39 | 39 | 48 | DB of choice | best web chat ergonomics; streaming for free |
| `pi-agent-core` | 68 | 49 | 49 | in-memory map | matches Cassi runtime |
| `anthropic-sdk` | 54 | 25 | 48 | none | native Anthropic message format |
| `mastra` | 46 | 25 | 48 | optional module | full agent framework (memory/eval/telemetry) |
| `langchain` | 45 | 25 | 48 | optional | familiar to LangChain users; heaviest deps |
| `llamaindex` | 56 | 27 | 56 | optional | RAG-ready (vector stores, query engines) |
| `hono` | 23 (router only) | 7 | 105 | none | mounts every surface in one app; runtime-agnostic |
| `bun` | 14 (router only) | 13 | 84 | none | Bun-native; smallest web variant |
| `deno` | 26 (router only) | 14 | 88 | none | Deno-native; same surfaces drop in unchanged |

## Surfaces

Independent of the variants — these adapters live once and any variant could mount them.

- **`surfaces/cli/`** — `node main.ts "<question>"` — proves `core/` runs without HTTP. ~15 LOC.
- **`surfaces/openai-compat/`** — `POST /v1/chat/completions` with `model: "catgpt"`. The agent-as-model pattern (same shape as Polly). Streaming + non-streaming. 5 unit tests.
- **`surfaces/a2a/`** — `GET /.well-known/agent-card.json` + `POST /a2a` (JSON-RPC `message/send`). Google A2A spec — the v1 inter-agent protocol per #10628. 7 unit tests.
- **`surfaces/web-chat/`** — `POST /chat[?stream=1]` plain SSE chat surface. The simplest streaming surface a browser can read. 4 unit tests.

## Tests

Pure-function tests run with zero install:

```bash
cd bees/catgpt
node --experimental-strip-types --test core/*.test.ts surfaces/openai-compat/*.test.ts
```

Currently: 14 core + 5 openai-compat + 7 a2a + 4 web-chat + 7 manifest = **37/37 passing** (no install).

Live tests (`core/live.test.ts`) hit real `gen.pollinations.ai` and are gated on `POLLINATIONS_LIVE=1` plus a token, so a missing token doesn't fail CI:

```bash
POLLINATIONS_LIVE=1 \
  POLLINATIONS_KEY=$(grep '^ENTER_API_TOKEN_REMOTE=' \
    ../../enter.pollinations.ai/.testingtokens | cut -d= -f2-) \
  node --experimental-strip-types --test core/live.test.ts
```

`scripts/smoke.sh` runs everything: unit tests, live tests (skipped without a token), parse-checks each variant's `*.ts`, and structural checks. **36/36 variant files parse, 37/37 tests pass, biome clean.**

## How to read this PR

1. Skim `core/` first — that's the bee logic, framework-free.
2. Read `manifest.ts` for the platform contract.
3. Compare `implementations/vanilla/src/agent.ts` to the others to see how each framework wraps the same logic.
4. Each variant's `README.md` has a "What this framework gives us / costs us" section.

## Observations

- **`core/` is tiny** (~80 LOC). Every variant imports it; nothing else is shared.
- **Web surface is consistently small** when the framework provides routing (`cloudflare-agents` web is 11 LOC). When it doesn't (`pi-agent-core`), we re-implement an HTTP shell.
- **Discord adapters converge to ~48 LOC** across most variants — Discord.js is the constant; only how each variant hands a question to the bee differs.
- **`agent.ts` LOC is misleading on its own:** the SDKs (`openai-agents-sdk`, `pi-agent-core`) take more lines because they wire tools/state plumbing CatGPT doesn't actually use. Look at the *shape* of each `agent.ts`, not the size.
- **Functional vs. class:** only `cloudflare-agents` requires a class (DO binding). All others are pure functions. Fits the project's style preference.
- **For a 3-line bee like CatGPT, the heavyweight frameworks lose decisively.** `vanilla` at 24 LOC is the most honest. The frameworks justify their weight only when memory / tools / multi-step workflow / streaming are real requirements.
- **The surface adapters are the same code regardless of the variant underneath.** Strong signal that surface adapters belong in the platform, not in each bee. The `hono`, `bun`, and `deno` variants all mount the same three handlers from `surfaces/` — their `agent.ts` is just a router, and their Discord adapter talks to the bee over HTTP like any other client.
- **Three variants without an SDK** (`hono`, `bun`, `deno`) end up smaller than the SDK-based ones. The agent layer collapses to ~15-25 LOC of routing once the surfaces do the heavy lifting.
- **Surfaces are runtime-portable.** Same `surfaces/` code mounts cleanly on Node (via Hono), Bun, and Deno — proves that `Request → Response` handlers are the right abstraction for cross-runtime portability.

## Status

Experimental. Not for merge. Each variant is independently runnable; `node_modules` are gitignored. Treat the comparison table above as the starting point for picking a v1 runtime in pollinations/pollinations#10628.
