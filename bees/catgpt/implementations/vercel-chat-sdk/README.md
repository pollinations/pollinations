# vercel-ai-sdk

Vercel AI SDK (`ai` + `@ai-sdk/openai`) — `generateText` / `streamText` over a custom OpenAI-compat provider pointing at Pollinations.

## Files

- `src/agent.ts` — `ask(question, imageUrl?, apiKey?)` using `generateText`. Functional, no class.
- `src/web.ts` — streaming `useChat`-compatible HTTP handler via `streamText` + `toDataStreamResponse`.
- `src/discord.ts` — Discord client; non-streaming path (Discord has no token streaming anyway).

## What this gives us

- **Streaming for free.** `useChat()` on the React side just works against `/api/chat` — no manual SSE plumbing.
- **Provider-agnostic.** Same SDK swaps Pollinations for OpenAI/Anthropic/Bedrock by changing one factory.
- **Strong web chat ergonomics.** This is the SDK with the most polished web chat story today.
- **Functional throughout.** No classes anywhere.

## What it costs

- Heavier dep tree than vanilla.
- Streaming response shape is Vercel-flavored — locks the web client to `useChat` (or compatible) unless you write a custom adapter.
- Multi-modal (image_url) attachments use the SDK's own format which doesn't always 1:1 match what Pollinations expects.

## Run locally

```bash
TEXT_POLLINATIONS_TOKEN=... npx tsx src/web.ts
BOT_TOKEN_CATGPT=... TEXT_POLLINATIONS_TOKEN=... npx tsx src/discord.ts
```
