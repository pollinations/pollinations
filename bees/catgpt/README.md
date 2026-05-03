# CatGPT — multi-framework experiment

Experimental side-by-side reimplementation of CatGPT (currently `apps/catgpt` web + `apps/catgpt-bot` Discord) across multiple agent runtime frameworks. Mirrors Cassi's `implementations/` pattern.

**Not for merge.** This is a free experimentation PR for the agent platform research in pollinations/pollinations#10628.

## Why

CatGPT is the canonical "one agent, two surfaces" case: identical 6-line system prompt + identical pipeline (`text → cat reply → comic image URL`) duplicated across `apps/catgpt/ai.js` and `apps/catgpt-bot/bot.ts`. Perfect wedge for evaluating agent runtimes.

Each variant implements the **same agent** with the **same surfaces** (web + Discord) using a different framework. We compare LOC, surface coupling, state model, deployment shape.

## Layout

```
bees/catgpt/
├── README.md                              ← this file
├── core/                                  ← framework-agnostic pure logic
│   ├── prompt.ts                          ← CAT_SYSTEM, createImagePrompt
│   ├── reply.ts                           ← generateCatReply(question, imageUrl, opts)
│   ├── image.ts                           ← buildComicImageUrl(question, reply, ...)
│   └── types.ts                           ← shared types
└── implementations/
    ├── vanilla/                           ← hand-rolled, baseline
    ├── cloudflare-agents/                 ← cloudflare/agents (DO + SQLite + AIChatAgent)
    ├── openai-agents-sdk/                 ← @openai/agents (TS) hosted-clients pattern
    ├── vercel-chat-sdk/                   ← Vercel AI SDK + chat UI
    └── pi-agent-core/                     ← pi-agent-core (matches Cassi's pi-ai-runtime)
```

## Same bee, every variant

```ts
// the whole bee: a few pure functions + config
import { generateCatReply, buildComicImageUrl } from "../core";

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
│   ├── agent.ts        ← agent definition in this framework's idiom
│   ├── web.ts          ← web/HTTP surface adapter
│   └── discord.ts      ← Discord surface adapter (where applicable)
└── ...framework-specific files
```

## Comparison table

Filled in as variants are completed. See each variant's README for details.

| Variant | LOC (agent) | LOC (web) | LOC (discord) | State | Deploy target | Notes |
|---|---|---|---|---|---|---|
| vanilla | 24 | 29 | 64 | none | any TS runtime | baseline |
| cloudflare-agents | 44 | 11 | 57 | DO + SQLite | Cloudflare Workers | first-party stateful, class required by DO |
| openai-agents-sdk | 73 | 25 | 60 | none here, SDK supports it | works on any TS runtime | tool-calling SDK, hosted-clients story for sandboxes |
| vercel-chat-sdk | 39 | 39 | 48 | none here, DB of choice | Vercel / any | best web chat ergonomics, streaming for free |
| pi-agent-core | 68 | 49 | 49 | in-memory map | any TS runtime | matches Cassi runtime |

## How to read this PR

1. Skim `core/` first — that's the agent logic, framework-free.
2. Compare `implementations/vanilla/src/agent.ts` to the others to see how each framework wraps the same logic.
3. Each variant's `README.md` has a "What this framework gives us / costs us" section.

## Observations from this round

- **`core/` is tiny** (~80 LOC across `prompt.ts`, `reply.ts`, `image.ts`, `types.ts`). Every variant imports it.
- **Web surface is consistently small** when the framework provides routing (`cloudflare-agents` web is 11 LOC). When it doesn't (`pi-agent-core`), we re-implement an HTTP shell.
- **Discord adapters are similar across variants** (~50–65 LOC) because Discord.js is the constant — the only difference is how each variant hands a question to the bee.
- **`agent.ts` LOC is misleading on its own:** the SDKs (`openai-agents-sdk`, `pi-agent-core`) take more lines because they wire tools/state plumbing the bee doesn't actually use yet. Look at the *shape* of each `agent.ts`, not the size.
- **Functional vs. class**: only `cloudflare-agents` requires a class (DO binding). All others are pure functions. Fits the project's style preference.

## Status

Experimental. Not for merge. Each variant is independently runnable; node_modules are gitignored. Treat the comparison table above as the starting point for picking a v1 runtime in pollinations/pollinations#10628.
