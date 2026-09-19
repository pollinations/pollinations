# scout-router

A [Pollinations code agent](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md) that routes each request to the best model — **deterministically, with no classifier call**. Most routers spend a nano-model call on every request to guess difficulty; scout-router reads the request shape directly, so routing adds **zero extra latency and zero extra pollen**, and every decision ships an explainable trace.

**Callable model:** `rekty/scout-router` (agent id `22a87097-ea6c-41fe-9343-b828e45ce112`)

## How it routes

Two live data sources drive every decision (fetched through the in-agent `pollinations()` helper and cached per isolate):

| Source | Used for |
| --- | --- |
| `GET /v1/models` | capabilities, modalities, context length, pricing, inline health |
| `GET /models/status?minutes=30` | live 5xx rate, p50 latency, tokens/sec (per-model rollups) |

1. **Signals** — read straight from the request body: image/audio/video parts, caller tools, estimated input tokens, code fences, reasoning keywords, conversation length.
2. **Tier** — `EASY` (short simple chat), `HARD` (multi code blocks / reasoning keywords / long context), else `MEDIUM`.
3. **Filter** — drop models that lack the requested modalities, tool calling, or context window; drop everything that does not support `/v1/responses`.
4. **Health gate** — drop models below 85% blended success (60% live 5xx-based rate from status, 40% catalog success rate). Caller-side 4xx is excluded from the live rate.
5. **Score by tier** —
   - `EASY`: cheapest healthy model wins; community models win close ties; speed breaks them.
   - `MEDIUM`: value score = health + speed − relative cost.
   - `HARD`: quality proxy (log-priced, larger-context models) + context bonus + health; cost barely matters.
6. **Escalation** — a non-OK downstream answer escalates to the next candidate (max 3 tries) and demotes the failed model for 10 minutes.
7. **Trace** — the response carries `x-scout-model`, `x-scout-tier`, `x-scout-reason`, `x-scout-trace` (JSON with signals, escalations, cost and health), and the same JSON is logged.

Callers may speak either API: bodies with `input` forward to `/v1/responses`, bodies with `messages` forward to `/v1/chat/completions`.

## Try it

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "rekty/scout-router", "messages": [{"role": "user", "content": "Hi"}]}'
```

Then inspect the `scout_trace` field in the JSON response. **Note:** the trace rides in the response body on `/v1/responses` — the gateway strips custom headers and unknown fields from `/v1/chat/completions` responses, so `/v1/responses` is the verifiable path.

## Agent-model safety

Managed agent models (other people's agents, including routers) are excluded from the candidate pool: they publish no token pricing (so cost-ranking treats them as free) and routing into another router would recurse. Models with no token pricing at all are excluded for the same reason.

## Layout

- `agent.ts` — the router (self-contained, only the bundled runtime).
- `agent.test.ts` — 14 `node:test` unit tests: tier heuristics, capability gating, health demotion, escalation, 502 path, both API shapes. Run with Node ≥ 23: `node --test agent.test.ts`.

## Deploy

1. Create the agent once: `npx @pollinations/cli agents create --config code-agent.json` (with `{"type":"code_agent","repository":"https://github.com/rekty/scout-router"}`).
2. Push to `main`, then `npx @pollinations/cli agents sync <agent-id>` — or let the included GitHub Action sync automatically when the repository variable `POLLINATIONS_SYNC_URL` is set.

## Live test evidence

See [TESTING.md](TESTING.md) — three requests routed differently with the trace of each.
