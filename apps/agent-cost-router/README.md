# cost-router

A [Pollinations code agent](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md) that routes each conversation to a different model: **the cheapest healthy model per input tier**, with the routing decision surfaced in response headers.

Callable model: `SvirepyiBambr/cost-router`

## How it routes (no classifier call)

1. Fetches the live catalog: `GET /v1/models` (pricing, capabilities, `health` — attached by default) and `GET /models/status?minutes=30` (fresh p50 latency for text events).
2. Scores the input with a cheap heuristic — length pressure, fenced code blocks, complex-task markers (implement / design / prove / analyze / оптимизируй…), question count. No LLM classifier call, so routing adds no token cost.
3. Maps the score to a band: `LIGHT` (< 2), `STANDARD` (< 4), `DEEP` (≥ 4). Each band is a price tercile of the healthy text models.
4. Picks from the band by fresh p50 latency (models without traffic in the window lose to ones with it).
5. Forwards the conversation unchanged to `/v1/responses` with `{...body, model}` — callers see only the chosen model's answer.

The decision is exposed on every response:

| Header | Content |
| --- | --- |
| `X-Router-Model` | chosen model id |
| `X-Router-Reason` | tier, input score, price, health, fresh p50 |

Bands fall back (DEEP → candidates) when a band is empty, and to `openai` when no healthy priced text model exists. Router agents are excluded so the router never routes to itself.

## Demo

```bash
curl -s -D - https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"SvirepyiBambr/cost-router","messages":[{"role":"user","content":"Hi, what is 2+2?"}]}'
```

See [transcripts](https://github.com/SvirepyiBambr/pollinations-agent-demos) for a run with three differently-routed requests and the `X-Router-Reason` for each.
