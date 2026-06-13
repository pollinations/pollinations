# bees/

First-class home for community/internal agents on Pollinations.

> **Why "bees"?** Pollinations has flowers, pollen, blooms, tiers — but no pollinators. Bees are the active half of the metaphor: each one flies out on a user's behalf, gathers from the platform's flowers, and returns with output. Singular `bee` reads as "an autonomous worker" without colliding with `pollen` (billing), `polly` (existing agent), or any tier name. See pollinations/pollinations#10628.

This directory is being introduced experimentally. Distinct from `apps/`:

- **`apps/`** — surface implementations (web app, Discord bot, CLI). Each app carries its own logic.
- **`bees/`** — agent definitions: prompts, tools, state, surfaces declared as data. Surface adapters live in the platform; the bee only declares what it needs.

The thesis: many Pollinations apps are really one agent with multiple surfaces. CatGPT is the canonical case — `apps/catgpt/` (web) and `apps/catgpt-bot/` (Discord) duplicate the same prompt and pipeline. Future state: one entry under `bees/catgpt/` that both surfaces consume.

## Today

- `bees/catgpt/` — multi-framework experiment. Same bee built five ways to compare runtime/SDK choices (Cassi-style `implementations/` pattern).

## Future shape (sketch)

```
bees/
├── README.md                 ← this
├── <bee-id>/
│   ├── manifest.ts           ← typed AgentManifest (issue #10628)
│   ├── core/                 ← prompt, tools, pipeline (framework-free, functional)
│   ├── prompts/              ← system prompts, examples
│   ├── tools/                ← MCP tools the bee owns
│   └── tests/
```

`manifest.ts` is the single declaration the platform reads — surfaces (openai-compat, web chat, Discord, A2A), state scope, billing route, runtime kind. See pollinations/pollinations#10628 for the schema.

## Style

Functional first. Classes only where a runtime forces them (e.g., a Cloudflare Durable Object binding). Each bee should be readable as "a few pure functions + a manifest."

## Status

Experimental. Directory naming, manifest schema, and runtime contract are not finalized — this is the wedge PR for those decisions.
