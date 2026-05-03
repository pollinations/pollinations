# llamaindex

[LlamaIndex.TS](https://ts.llamaindex.ai/) — `@llamaindex/openai`'s `OpenAI` LLM repointed at Pollinations.

## Files

- `src/agent.ts` — `llm.chat({ messages })` with `CAT_SYSTEM` prepended.
- `src/web.ts` / `src/discord.ts` — surface adapters.

## What this gives us

- **RAG-ready.** LlamaIndex's strength is data agents — vector stores, query engines, structured extraction. CatGPT doesn't use any of it, but the bee can grow into them without changing frameworks.
- **Stable LLM call API.** `llm.chat({ messages })` is one of the cleanest in the ecosystem.

## What it costs

- **Bigger framework than the bee needs.** For pure chat, `core/`'s `generateCatReply` does the same thing in less code.
- LlamaIndex's TS port has more breaking changes per release than the Python original — pin versions.

## Run locally

```bash
TEXT_POLLINATIONS_TOKEN=... npx tsx src/web.ts
BOT_TOKEN_CATGPT=... TEXT_POLLINATIONS_TOKEN=... npx tsx src/discord.ts
```
