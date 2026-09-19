# Pulse Router — health + cost model router

Code agent for quest [#15017](https://github.com/pollinations/pollinations/issues/15017).

Picks a healthy text model from the live catalog + `/models/status?minutes=30`, then answers as that model. Callers see only the chosen answer; routing is visible in response headers.

| Header | Meaning |
| --- | --- |
| `x-pulse-router-model` | Chosen model id |
| `x-pulse-router-reason` | Band + community/first-party + cost + 5xx + p50 |

## Routing

1. Score the prompt into `EASY` / `NORMAL` / `HARD` (length + keywords; no classifier call).
2. Keep models that support `/v1/responses`, have recent text traffic (`is_rollup=1`), and ≤8% 5xx.
3. **EASY:** prefer healthy **community** models, then cheapest.
4. **NORMAL:** prefer low p50 among the cheaper healthy band.
5. **HARD:** skip the cheapest third; pick a mid/high healthy model.
6. If the pool is empty → `openai`.

Gen already retries declared fallbacks; this agent chooses *between* models.

## Deploy

Public source: https://github.com/iotserver24/agent-pulse-router

1. My Models → Add Agent → Code agent → paste that repo URL  
   or `npx @pollinations/cli agents create --config code-agent.json`
2. Callable model: `iotserver24/agent-pulse-router` (repo-derived id)

```json
{ "type": "code_agent", "repository": "https://github.com/iotserver24/agent-pulse-router" }
```

## Demo (three different routes)

```bash
# EASY — short ask → cheap/community healthy model
curl -sD - https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"iotserver24/agent-pulse-router","input":"Say hi in five words.","store":false}' -o /dev/null

# NORMAL — medium ask → low-latency cheaper band
curl -sD - https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"iotserver24/agent-pulse-router","input":"Explain how a bloom filter works in two short paragraphs.","store":false}' -o /dev/null

# HARD — code/design → stronger healthy model
curl -sD - https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"iotserver24/agent-pulse-router","input":"Design and implement a small TypeScript LRU cache with tests; discuss tradeoffs.","store":false}' -o /dev/null
```

Inspect `x-pulse-router-model` and `x-pulse-router-reason` on each response.
