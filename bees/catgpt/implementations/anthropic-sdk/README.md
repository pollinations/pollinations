# anthropic-sdk

Anthropic's official TS SDK (`@anthropic-ai/sdk`) repointed at Pollinations.

## Files

- `src/agent.ts` — `ask(question, imageUrl?, apiKey?)`. Just `c.messages.create({...})`.
- `src/web.ts` / `src/discord.ts` — same surface adapters as the other variants.

## What this gives us

- **Native Anthropic message format.** No mapping through OpenAI's chat schema.
- **Streaming, tool use, vision** via the SDK's first-class APIs (we don't use them yet but they're there).
- **Familiar to anyone already using Claude.** A bee author who's wired to `c.messages.create` doesn't need to learn anything.

## What it costs

- **Routing assumption.** This variant talks to `https://gen.pollinations.ai/anthropic` — Pollinations' Anthropic-native passthrough. If a model is only routed via the OpenAI-compat path, this won't work for that model. Today's `claude-fast` is fine, but worth noting as a shape-of-the-platform thing.
- One more SDK in the dep tree.

## Run locally

```bash
TEXT_POLLINATIONS_TOKEN=... npx tsx src/web.ts
BOT_TOKEN_CATGPT=... TEXT_POLLINATIONS_TOKEN=... npx tsx src/discord.ts
```
