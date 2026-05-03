# mastra

[Mastra](https://mastra.ai/) — TypeScript agent framework on top of the Vercel AI SDK. Adds workflows, memory, eval, telemetry as opt-in modules.

## Files

- `src/agent.ts` — `Agent({ name, instructions, model })` over a Pollinations OpenAI-compat provider; exports `ask()` for the surfaces.
- `src/web.ts` / `src/discord.ts` — surface adapters.

## What this gives us

- **Bridges to bigger features quickly.** Memory, telemetry, evals, and structured workflows are all one config away if CatGPT ever needs them.
- **Same model layer as the Vercel AI SDK variant.** A bee author can move between the two without rewriting the core.
- **Strong DX for the "agent + tools + workflow" shape.** Probably overkill for CatGPT today; useful when a bee grows into multi-step orchestration.

## What it costs

- Heaviest dep tree of the lot.
- Newer framework — APIs still moving (currently 0.10.x).
- Some Mastra modules assume Node-only (storage, telemetry) which can complicate Cloudflare Worker deploys.

## Run locally

```bash
TEXT_POLLINATIONS_TOKEN=... npx tsx src/web.ts
BOT_TOKEN_CATGPT=... TEXT_POLLINATIONS_TOKEN=... npx tsx src/discord.ts
```
