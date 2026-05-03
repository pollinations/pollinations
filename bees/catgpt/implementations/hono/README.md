# hono

[Hono](https://hono.dev/) — lightweight web framework, runs on every JS runtime. Mounts every surface (`a2a`, `openai-compat`, `web-chat`) in one app.

## Files

- `src/agent.ts` — the whole bee is a Hono app. Imports the three surface handlers from `surfaces/` and delegates the matching route paths to them. **No bee logic in this file** — it's a router.
- `src/web.ts` — `@hono/node-server` entry point.
- `src/discord.ts` — Discord client that talks to the hono app over HTTP at `/v1/chat/completions`. Demonstrates surface composition: the Discord adapter is just an OpenAI client.

## What this gives us

- **Multi-surface in one process.** A2A discovery + OpenAI-compat + plain web chat all live behind one Hono app.
- **Runtime-agnostic.** Same code runs on Workers, Bun, Deno, Node, Vercel Edge.
- **Surfaces become composable.** Each surface adapter is a standalone `Request → Response` function; Hono just hands them off.
- **Discord becomes a peer client.** Instead of importing `core/` itself, the Discord adapter calls `/v1/chat/completions` like any other consumer. Validates that the bee's external API is its own dogfood.

## What it costs

- Adds Hono dep (small — ~30 KB).
- Two-process dev: web server + Discord client. Discord can also run inside Hono via Discord's HTTP interactions, but that's a different shape.

## Run locally

```bash
TEXT_POLLINATIONS_TOKEN=... npx tsx src/web.ts
# in another terminal:
BOT_TOKEN_CATGPT=... HONO_BASE=http://localhost:8787 npx tsx src/discord.ts

# poke the surfaces:
curl http://localhost:8787/.well-known/agent-card.json | jq
curl -X POST http://localhost:8787/chat -H "content-type: application/json" \
  -d '{"question":"why are boxes magic?"}' | jq
```
