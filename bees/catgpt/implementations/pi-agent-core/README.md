# pi-agent-core

[`@mariozechner/pi-agent-core`](https://www.npmjs.com/package/@mariozechner/pi-agent-core) — the framework Cassi uses for its restaurant agent runtime.

Mirrors the structure of `cassi/implementations/pi-ai-runtime/`: an HTTP runtime with a per-conversation in-memory `Agent` map, configured via `getApiKey` / `getBaseUrl` to talk to Pollinations instead of an upstream provider.

## Files

- `src/agent.ts` — `getOrCreate(conversationId)` returns a `pi-agent-core` `Agent` configured for Pollinations OpenAI-compat. `ask(conversationId, question, ...)` prompts and extracts the assistant text, then deterministically builds the comic URL via `core/`.
- `src/web.ts` — Cassi-style Node HTTP runtime with `/health` and `POST /inbound`.
- `src/discord.ts` — Discord client; uses `discord:<userId>` as the conversation key.

## What this gives us

- **Drop-in replacement for Cassi's runtime.** Same SDK, same shape — if Cassi migrates onto the platform, the runtime contract is already proven by another bee.
- **Multi-turn for free.** The `Agent` retains messages across calls in `agent.state.messages`. CatGPT doesn't need it today, but the slot is there.
- **Tool-ready.** `pi-agent-core` integrates with MCP tools the same way Cassi does. Future CatGPT tools (e.g., "fetch my litter-box stats") slot in without restructuring.

## What it costs

- Newer / less-known SDK than the OpenAI or Vercel ones.
- In-memory map = no persistence across restarts. Cassi pairs this with a separate KV store; CatGPT would need the same eventually.
- pi-ai's provider abstraction needs a small `getBaseUrl` override to repoint at Pollinations — not yet documented as a stable API.

## Run locally

```bash
TEXT_POLLINATIONS_TOKEN=... npx tsx src/web.ts
BOT_TOKEN_CATGPT=... TEXT_POLLINATIONS_TOKEN=... npx tsx src/discord.ts
```
