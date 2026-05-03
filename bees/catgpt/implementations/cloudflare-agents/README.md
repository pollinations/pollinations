# cloudflare-agents

[`agents`](https://www.npmjs.com/package/agents) (Cloudflare's official agent framework) — DO + SQLite + `AIChatAgent`.

## Files

- `src/agent.ts` — `class CatGPT extends AIChatAgent` — adds a `turns` SQLite table on first message and persists each Q/A/comic URL.
- `src/worker.ts` — exports the DO + `routeAgentRequest` for `/agents/catgpt/<id>/chat`.
- `src/discord.ts` — Discord client that posts to the agent's HTTP surface using `discord:<userId>` as the agent slot key (state per Discord user).

## What this gives us

- **State for free.** Per-user history in SQLite, one DO per `(agent, user)`. Drops in without a separate database.
- **Built-in HTTP surface.** `routeAgentRequest` provides `/agents/catgpt/:id/chat` with no boilerplate.
- **Web client compatibility.** A React app can use `useAgentChat` against the same `/agents/catgpt/:id/chat` endpoint without us writing a chat protocol.
- **Identity slot is explicit.** The DO id (`discord:<userId>`, `web:<sessionId>`, etc.) is the (agent × user) slot we've been describing in #10628.

## What it costs

- Cloudflare-only deploy. Vendor lock-in unless we wrap with the manifest abstraction.
- DO billing model — every active conversation = a wakeable DO. Quota math matters at scale.
- `agents` package is young (~v0.0.x); API may shift.

## Run locally

```bash
# Worker (provides the agent + HTTP surface)
TEXT_POLLINATIONS_TOKEN=... npx wrangler dev

# Discord (separate process; talks to the worker via AGENT_BASE)
BOT_TOKEN_CATGPT=... AGENT_BASE=http://localhost:8787 npx tsx src/discord.ts
```
