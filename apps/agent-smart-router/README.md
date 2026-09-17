# Smart Router — cost + health + difficulty cascade

A **code agent** that picks which model answers each request, then answers as that model. Callers see only the chosen model's answer; routing trace is in `x-pollinations-router` header and `_router` JSON field.

## Strategy

1. **Live catalog** via `pollinations("/v1/models")` — sorts models by prompt cost (cheapest first).
2. **Health** via `pollinations("/models/status?minutes=30")` — computes health score from `errors_5xx/requests` and `p95_latency_ms`; filters to health > 0.6.
3. **Difficulty** — heuristic: short text → easy, code/multimodal/medium → medium, long/reasoning/architecture → hard. For ambiguous medium + long prompt, a tiny `gpt-5.4-nano` classifier votes FAST/BALANCED/DEEP.
4. **Cascade**:
   - easy → cheapest healthy
   - medium → median-cost healthy (balanced)
   - hard → most capable healthy (highest-cost healthy with health>0.7)

Gen already retries declared fallbacks; this router's value is choosing *between* models, not retrying one.

## Routing trace

Every response includes:
- Header `x-pollinations-router: {"chosen":"...", "level":"easy|medium|hard", "reason":"..."}`
- JSON body `_router` when content-type is JSON.

## Demo — three requests routed differently

```bash
# easy: short
curl -s https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
  -d '{"model":"YOUR_USER/agent-smart-router","input":"What is 2+2?","store":false}' -D - | grep -i x-pollinations-router
# → {"chosen":"openai-fast","level":"easy","reason":"easy→cheapest healthy (heuristic:short prompt...)"}

# medium: code
curl -s https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
  -d '{"model":"YOUR_USER/agent-smart-router","input":"Write a python function to parse CSV and handle quoted commas","store":false}' -D - | grep -i x-pollinations-router
# → {"chosen":"gemini-3.8-flash","level":"medium","reason":"medium→balanced cost (#...)"}

# hard: architecture + reasoning
curl -s https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
  -d '{"model":"YOUR_USER/agent-smart-router","input":"Design a distributed idempotency system for payment webhooks with exactly-once semantics, compare 3 approaches and prove tradeoffs","store":false}' -D - | grep -i x-pollinations-router
# → {"chosen":"grok-4.3","level":"hard","reason":"hard→capable (heuristic:reasoning/architecture keywords)"}
```

## Deploy

Fork this repo, put `agent.ts` at root, then in dashboard **My Models → Add agent → Code agent → *your fork URL*** or:

```bash
npx @pollinations/cli agents create --config code-agent.json
# code-agent.json: {"type":"code_agent","repository":"https://github.com/YOUR_USER/agent-smart-router"}
```

Model name: `<github-username>/agent-smart-router`

Only `ai` and `@ai-sdk/openai-compatible` may be imported; `pollinations()` is the platform helper for catalog/status.

## Files

- `agent.ts` — single-file router (no npm deps, bundled `ai` 7.0.66)
