# openai-agents-sdk

OpenAI's TS Agents SDK (`@openai/agents`) — `Agent` + `tool()` + `run()` over a Pollinations OpenAI-compat client.

## Files

- `src/agent.ts` — `Agent` definition with two tools (`cat_reply`, `comic_url`) wrapping `core/`. The OpenAI client is repointed at `https://gen.pollinations.ai/v1`.
- `src/web.ts` — minimal HTTP handler that calls `ask(question, imageUrl?, apiKey?)`.
- `src/discord.ts` — Discord client that extracts the comic URL from the agent's final output.

## What this gives us

- **Standard agent loop.** Tool calling, multi-turn, streaming all live in the SDK — we don't write the loop.
- **Hosted-clients story.** SDK ships adapters for Blaxel/Cloudflare/Daytona/E2B/Modal/Runloop/Vercel — one path to a sandboxed runtime when CatGPT grows real tools.
- **Pollinations as the model provider.** No code changes vs. talking to OpenAI — just `baseURL` swap.

## What it costs

- More indirection per turn. Two tool calls (`cat_reply` then `comic_url`) instead of one HTTP call. Token overhead from the tool-calling protocol.
- The final string isn't structured — Discord adapter has to regex the comic URL out. A more idiomatic version would have a single `respond` tool that returns `{reply, comicUrl}` as JSON.
- SDK dependency surface (`@openai/agents`, `openai`, `zod`).

## Run locally

```bash
TEXT_POLLINATIONS_TOKEN=... npx tsx src/web.ts
BOT_TOKEN_CATGPT=... TEXT_POLLINATIONS_TOKEN=... npx tsx src/discord.ts
```
