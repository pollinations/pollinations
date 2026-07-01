# deno

Deno-native variant. `Deno.serve` — no framework. Mounts the same three surface adapters as the hono / bun variants.

## Files

- `src/agent.ts` — single `route(req)` function that dispatches paths to the surface handlers in `surfaces/`. ~25 LOC.
- `src/web.ts` — `Deno.serve({ port }, route)`. ~10 LOC.
- `src/discord.ts` — Discord client that talks to the deno server (runs under Node — discord.js does not target Deno).

## What this gives us

- **Three runtimes, same surfaces.** With `hono` (Node) and `bun` already in the matrix, deno completes the JS-runtime triangle. The surface adapters are unchanged — strong evidence that surfaces are runtime-portable.
- **Deno Deploy.** Push the same code to Deno Deploy without a build step.
- **Permissions model.** `--allow-net --allow-env` is explicit; useful when running untrusted bees.

## What it costs

- Deno-only for the web side. (Discord stays on Node.)
- TS imports already use explicit `.ts` extensions, which is what Deno requires — but means we never broke from Node ESM strict mode either.

## Run locally

```bash
TEXT_POLLINATIONS_TOKEN=... deno run --allow-net --allow-env src/web.ts
BOT_TOKEN_CATGPT=... node --experimental-strip-types src/discord.ts
```
