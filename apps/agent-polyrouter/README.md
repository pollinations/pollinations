# agent-polyrouter

Code agent: routes each request to **the cheapest healthy Pollinations model
that fits the request's complexity**, then forwards the conversation
unchanged - callers see only the chosen model's answer.

- **Source repository:** https://github.com/afanasevmylife/polyrouter
- **Callable model:** `afanasevmylife/polyrouter`

## How it routes

1. **Classify in pure code** (no LLM call spent on routing): prompt length,
   code fences, reasoning keywords, conversation length, images and tools map
   the request to a `fast` / `balanced` / `deep` tier.
2. **Live platform data**: `GET /v1/models?status=all` (pricing, capabilities,
   health) and `GET /v1/models/status?minutes=30` (p95 latency), fetched via
   the agent's `pollinations()` helper.
3. **Pick**: among healthy text models satisfying the request's capability
   needs (image input, `tool_calling`; `deep` also requires `reasoning`),
   sorted by unit price with live p95 latency as tiebreak - `fast` takes the
   cheapest, `balanced` the median-priced, `deep` the strongest. Empty bands
   escalate upward. The gateway still handles per-model fallback retries;
   this agent only chooses between models.

## Verifying the routing

Non-streaming Responses calls carry a `polyrouter_trace` body field (the
gateway strips upstream headers), and demos/ contains three live requests
routed differently - `fast`, `deep`, and `balanced`+tools - each with its
recorded reason:

```
"polyrouter_trace": {
  "model": "community/morriszdweck/osaii-swarm",
  "tier": "fast",
  "why": "score 0; simple prompt; picked cheapest healthy of 34; skipped ..."
}
```

## Tests

`node --experimental-strip-types --test agent.test.ts` (Node 22+) - 10 tests
covering the classifier, tier/capability/health filtering, escalation, the
latency tiebreak, and request forwarding.
