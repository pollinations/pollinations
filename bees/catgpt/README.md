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
└── implementations/                       ← same bee, eight frameworks
    ├── vanilla/                           ← hand-rolled, baseline
    ├── cloudflare-agents/                 ← cloudflare/agents (DO + SQLite + AIChatAgent)
    ├── openai-agents-sdk/                 ← @openai/agents (TS) hosted-clients pattern
    ├── vercel-chat-sdk/                   ← Vercel AI SDK + chat UI
    ├── pi-agent-core/                     ← pi-agent-core (matches Cassi's pi-ai-runtime)
    ├── anthropic-sdk/                     ← @anthropic-ai/sdk against Pollinations
    ├── mastra/                            ← Mastra agent framework
    └── langchain/                         ← LangChain.js ChatOpenAI
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

## Surfaces

Independent of the variants — these adapters live once and any variant could mount them.

- **`surfaces/cli/`** — `node main.ts "<question>"` — proves `core/` runs without HTTP. ~15 LOC.
- **`surfaces/openai-compat/`** — `POST /v1/chat/completions` with `model: "catgpt"`. The agent-as-model pattern (same shape as Polly). Streaming + non-streaming. Includes 5 unit tests.

## Tests

Pure-function tests run with zero install:

```bash
cd bees/catgpt
node --experimental-strip-types --test core/*.test.ts surfaces/openai-compat/*.test.ts
```

Currently: 14 core tests + 5 OpenAI-compat surface tests = **19/19 passing**.

Live integration tests (which actually hit `gen.pollinations.ai`) are gated on `TEXT_POLLINATIONS_TOKEN` and skipped otherwise.

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
- **The `surfaces/openai-compat` adapter is the same code regardless of the variant underneath.** Strong signal that surface adapters belong in the platform, not in each bee.

## Status

Experimental. Not for merge. Each variant is independently runnable; `node_modules` are gitignored. Treat the comparison table above as the starting point for picking a v1 runtime in pollinations/pollinations#10628.
