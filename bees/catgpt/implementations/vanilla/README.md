# vanilla

Hand-rolled baseline. No agent framework, just `core/` + thin surface adapters.

## Files

- `src/agent.ts` — `runCatGPT({question, imageUrl, apiKey})` — wraps `core/`
- `src/web.ts` — minimal `Request → Response` HTTP handler
- `src/discord.ts` — Discord.js client, replaces the existing `apps/catgpt-bot/bot.ts`

## What this gives us

- **Honest baseline.** Every other variant is measured against this. If a framework can't beat hand-rolled on something concrete (LOC, state, observability), we shouldn't add the dependency.
- **Surface adapters are tiny.** `web.ts` is ~25 LOC, `discord.ts` is ~55 LOC. The agent itself is ~10 LOC because all the real logic lives in `core/`.

## What it costs

- No conversation memory. Every request is stateless.
- No streaming. Each surface defines its own response shape.
- No tool calls / multi-turn. Just `question → reply → comic URL`.

## Run locally

```bash
# Web (Bun, Deno, or Node 18+ with --experimental-vm-modules)
TEXT_POLLINATIONS_TOKEN=... bunx --bun tsx src/web.ts

# Discord
BOT_TOKEN_CATGPT=... CATGPT_CHANNEL_ID=... TEXT_POLLINATIONS_TOKEN=... \
  npx tsx src/discord.ts
```
