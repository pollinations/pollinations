# polyrouter

A code-only model router for [Pollinations](https://pollinations.ai). For each
request it picks **the cheapest healthy model that fits the request's
complexity**, then forwards the conversation unchanged - callers see only the
chosen model's answer. Routing and model calls use the caller's Pollen.

Built from the
[pollinations-router-agent](https://github.com/pollinations/pollinations-router-agent)
template, but with one deliberate difference: **classification spends no LLM
call**. The template asks a small model to label the request; polyrouter
derives the tier from request features in plain code (cheaper, faster,
deterministic), then lets live platform data make the final pick.

## How routing works

1. **Classify (pure code)** - scans the Responses request: prompt length,
   code fences, reasoning keywords, conversation length, images, tools.
   Produces a tier: `fast`, `balanced`, or `deep`.
2. **Live data** - `GET /v1/models?status=all` (price, capabilities) and
   `GET /models/status?minutes=30` (raw per-model rollups: 2xx/5xx counts,
   p95 latency, tokens/sec), fetched in parallel through the agent's
   `pollinations()` helper. The status feed is aggregated in code into
   per-model health: a model is skipped only when the majority of its recent
   calls failed with 5xx (4xx are client faults; low-traffic models get the
   benefit of the doubt). When the status feed is unreachable the router
   degrades gracefully to price-only routing.
3. **Pick** - eligible text models that satisfy the request's capability needs
   (image input, `tool_calling`; `deep` also requires `reasoning`), sorted by
   unit price with live p95 latency as tiebreak:
   - `fast` -> cheapest candidate
   - `balanced` -> median-priced candidate
   - `deep` -> priciest (strongest) candidate
   - empty band escalates upward; last resort is any eligible text model
4. **Forward** - the original request body goes to `/v1/responses` with only
   `model` replaced. The gateway still applies the model's own declared
   fallbacks - this agent chooses between models, it does not retry one.

## Verifying the routing

Every response carries a trace on headers:

```
x-polyrouter-model: inception/mercury-2.5-preview
x-polyrouter-tier: fast
x-polyrouter-why: score 0; simple prompt; picked cheapest eligible of 87; skipped 21 unhealthy (5xx), ...
```

Three requests routed differently, with reasons: see [`demos/`](demos/).

## Deploy your own

1. Fork this repository.
2. In [My Models](https://enter.pollinations.ai/my-models), choose
   **Add Agent -> Code agent** and enter your fork's URL - or run
   `npx @pollinations/cli agents create --config code-agent.json`.
3. Edit `agent.ts`, push, then **Sync** in the dashboard (or enable the
   included GitHub Action with the `POLLINATIONS_SYNC_URL` repository
   variable set to
   `https://gen.pollinations.ai/account/agents/YOUR_AGENT_ID/sync`).

## Test

```bash
node --experimental-strip-types --test agent.test.ts   # Node 22+
```

[Agent guide](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md)
