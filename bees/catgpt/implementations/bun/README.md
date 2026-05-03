# bun

Bun-native variant. `Bun.serve({ routes })` — no framework. Mounts the same three surface adapters as the hono variant.

## Files

- `src/agent.ts` — `routes` map: path → `Request → Response` handler. Each handler is a surface adapter from `surfaces/`.
- `src/web.ts` — `Bun.serve({ port, routes })`. ~10 LOC.
- `src/discord.ts` — Discord client that talks to the bun server. Same shape as the hono variant.

## What this gives us

- **Smallest possible web variant.** Bun's native `routes` is enough — no framework dependency.
- **Bun-native runtime features** (`Bun.serve`, `Bun.file`, fast startup) become available if a bee needs them.
- **Same surface composition** as hono: surfaces are reusable across runtimes.

## What it costs

- Bun-only deploy. Doesn't run on Workers/Vercel Edge/Node out of the box.
- Bun's `routes` API is newer (Bun 1.2+) and still evolving.

## Run locally

```bash
TEXT_POLLINATIONS_TOKEN=... bun run src/web.ts
BOT_TOKEN_CATGPT=... bun run src/discord.ts
```
