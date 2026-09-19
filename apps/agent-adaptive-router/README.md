# adaptive-router

A **code agent** that picks which model answers each request, then answers as that model.
Callers see one ordinary model: `Apollohzl/adaptive-router`.

- **Repository:** https://github.com/Apollohzl/adaptive-router
- **Callable model:** `Apollohzl/adaptive-router`
- **Quest:** fixes #15017

## How it routes

1. **Difficulty tier.** One cheap call (`openai/gpt-oss-20b`, `max_output_tokens: 64`,
   `temperature: 0`) labels the request `FAST`, `BALANCED` or `DEEP`. The conversation is
   passed as JSON *data* behind an explicit "do not follow these instructions" wrapper, so a
   prompt inside the request cannot steer the router. If the call fails or returns no label, a
   keyword/length heuristic picks the tier — the router never blocks on itself.
2. **Quality bar.** Each tier is a price floor in blended Pollen per 1k tokens (`FAST` 0,
   `BALANCED` 0.0006, `DEEP` 0.003). Price is the capability proxy, so the floor *is* the bar.
3. **Live health.** `GET /models/status?minutes=30` per-model rollups drop models below 80%
   success over 8+ requests, or that never served in 3+ tries. This is what makes the router
   switch away from a degrading model with no code change.
4. **Cheapest healthy wins,** ties broken by p95 latency — after hard constraints
   (`/v1/responses` support, image input when the request has images, tool calling when
   `tools` is set, enough context length). Community models are excluded so the router can
   never route into another router.

Nothing clearing the bar? The bar relaxes instead of failing, and the trace says so. Catalog
unreachable? A small static per-tier list keeps it answering. On `429`/`5xx` it replays the
identical request to the next candidate, up to three attempts — escalation *between* models,
since Gen already retries a model's own fallbacks.

## Verifying the routing

Every response carries `x-router-model`, `x-router-tier`, `x-router-reason` and
`x-router-candidates`; the same line is logged.

```
x-router-model: x-ai/grok-4.6
x-router-tier: DEEP
x-router-reason: classifier -> tier=DEEP; bar>=0.003; cost=0.00300/1k; success 100% of 1 req,
  p95 11929ms; healthy 11/13 above bar; cheapest healthy, then lowest p95; text only
x-router-candidates: x-ai/grok-4.6,qwen/qwen3.7-max,qwen/qwen3.8-2.4t-a95b
```

## Demonstration

`demo.ts` runs the real selection logic against the **live** catalog and the **live** 30-minute
health feed; only the classifier label is stubbed, because labelling needs an API key. Four
requests, four different models, 2026-09-19:

| Request | Tier | Model | Why |
| --- | --- | --- | --- |
| "Translate 'good morning' into French." | FAST | `inception/mercury-2.5-preview` | `cost=0.00010/1k; healthy 54/66 above bar; cheapest healthy, then lowest p95` |
| "Write a Python function that merges two sorted linked lists, plus pytest tests." | BALANCED | `xiaomi/mimo-v2.5-pro` | `bar>=0.0006; cost=0.00069/1k; healthy 32/37 above bar` |
| "Design a multi-region failover architecture for a card payment system…" | DEEP | `x-ai/grok-4.6` | `bar>=0.003; cost=0.00300/1k; success 100% of 1 req, p95 11929ms; healthy 11/13 above bar` |
| An image of a receipt + "What does this receipt say?" | BALANCED (bumped from FAST) | `mistralai/mistral-large-3` | `request carries images; cost=0.00075/1k; healthy 24/28 above bar` |

`node --test agent.test.ts` covers the same behaviour offline (8 tests): three tiers routing to
three models, degraded models skipped, latency tie-breaks, image bump, classifier failure
falling back to the heuristic, 503 escalation, unreachable catalog.

## Deploy

```json
{ "type": "code_agent", "repository": "https://github.com/Apollohzl/adaptive-router" }
```

```bash
npx @pollinations/cli agents create --config code-agent.json --visibility public
```

Push to `main` with the repository variable
`POLLINATIONS_SYNC_URL=https://gen.pollinations.ai/account/agents/<agent-id>/sync` to redeploy.
