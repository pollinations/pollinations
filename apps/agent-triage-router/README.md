# Triage router

A Pollinations **code agent** that picks a model per request and answers as that model.
Every decision is made at request time from live data:

| Signal | Source | Used for |
| --- | --- | --- |
| Task tier | the request itself (length, code, tools, images, reasoning words) | choosing which pool to draw from |
| Model health | `GET /models/status?minutes=30` (rollup rows) | moving traffic off a model that is currently degrading |
| Price | `GET /v1/models` (`promptTextTokens` + `completionTextTokens`) | picking the cheapest model that clears the tier |
| Endpoint support | `supported_endpoints` from `GET /v1/models` | skipping models that cannot serve the Responses API |
| Modality / context | `input_modalities`, `context_length` from `GET /v1/models` | skipping models that cannot take the input |

Callable model: **`community/xiaotian1171/triage-router`**

## How a request is routed

1. **Classify the tier.**
   - `deep` — long input (>2400 chars), or a reasoning-shaped ask with code/tools: *"review this and refactor it, compare the trade-offs"*.
   - `balanced` — images (needs a vision-capable model), tool lists, or ordinary medium requests.
   - `fast` — short plain requests (under 320 chars, no code, no tools, no images).
2. **Score every pool member.** `score = price × penalty`, where `penalty` turns the last
   30 minutes of health into a multiplier on the advertised price:

   ```
   penalty = (1 + 6·5xxRate) · (1 + 3·rescueRate) · latencyFactor · slowTail · throughput
   ```

   `latencyFactor` follows p95 above 45s, `slowTail` reacts when fewer than half of the
   outcomes were 2xx, `throughput` reacts below 10 tok/s. Only 2xx and 5xx count as
   outcomes: a 4xx is a caller-side mistake and says nothing about model health. Models
   with fewer than 5 requests in the window are treated as unproven (penalty 1, noted as
   `no recent traffic`). A model with `penalty ≥ 6` is marked **degraded** and only used
   if its whole pool is degraded.
3. **Pick.** `deep` takes the strongest healthy model (price is the capability proxy);
   `fast` and `balanced` take the cheapest healthy model that fits. Pool members that are
   missing from the live catalog, cannot serve the endpoint, cannot take images for an
   image request, or have too small a context window are skipped and named in the reason.
   `amazon/nova-micro-v1` is a worked example: it is the cheapest model in the fast pool,
   but the catalog only lists it under `/v1/chat/completions`, and the agent gateway hands
   the agent a Responses-shaped request, so outgoing calls are Responses calls and
   nova-micro is skipped (`no /v1/responses`) in favour of `openai/gpt-oss-20b`.
4. **Forward.** The chosen model answers through `POST /v1/responses`, and the answer is
   returned to the caller unchanged apart from the trace below.
5. **Escalate.** A 422, 429 or 5xx from the chosen model re-runs the pick one tier
   up (`fast → balanced → deep`) and reports the escalation. Each attempt preserves the
   conversation, attachments, and instructions. If no pool has a compatible model,
   the router returns an error rather than ignoring the input requirements.

## Reading the decision

Every answer carries headers, so one call shows both the answer and the reasoning:

| Header | Meaning |
| --- | --- |
| `x-router-model` | model that produced the answer |
| `x-router-tier` | `fast` / `balanced` / `deep` |
| `x-router-why` | one-sentence reason, including skipped candidates |
| `x-router-pool` | every candidate with its score in 1e-9 pollen/token and its health note |
| `x-router-degraded` | candidates excluded for poor health |
| `x-router-escalated-to` | set when a failed tier was escalated |

JSON answers also carry the same trace in the body as `router`, so a caller that never
sees the headers can still check the routing:

```json
{
  "model": "gpt-oss-20b",
  "output": [{ "type": "message", "content": [{ "type": "output_text", "text": "..." }] }],
  "router": {
    "model": "openai/gpt-oss-20b",
    "tier": "fast",
    "why": "cheapest healthy model at fast tier; 100% ok, p95 25s, 65 tok/s; ~1 input tokens; skipped amazon/nova-micro-v1 (no /v1/responses)",
    "pool": "openai/gpt-oss-20b*=\"230.000\" (100% ok, p95 25s, 65 tok/s) | openai/gpt-5-nano=\"337.500\" (100% ok, ...) | amazon/nova-micro-v1 (no /v1/responses)"
  }
}
```

Streamed answers are passed through untouched apart from the headers. The agent also logs
each decision as one JSON line.

Two gateway behaviours are worth knowing when you test a router like this:

- **Answers are cached.** An identical request is served from cache (`x-cache: HIT`), so the
  routing decision is only recomputed on a cache miss. Put a nonce in the prompt to force a
  fresh decision.
- **Custom response headers can be dropped** by the cache in front of the agent. The body
  `router` field and the log line are the channels that always survive; use the headers
  when the caller reaches the agent directly.

### Live examples

```bash
curl -s https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_KEY" -H "content-type: application/json" \
  -d '{"model":"community/xiaotian1171/triage-router","input":"Reply with one word: the colour of a ripe banana.","max_output_tokens":600}' \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["model"], d["router"]["tier"], d["router"]["why"])'
```

Three requests, three different models, each for a different reason:

| Request | Chosen model | Tier | Why |
| --- | --- | --- | --- |
| short prompt | `gpt-oss-20b` | fast | cheapest healthy model at fast tier |
| prompt with an image | `accounts/fireworks/models/glm-5p3-flash` (`z-ai/glm-5.3-flash`) | balanced | cheapest healthy model that can read images |
| ~1200-token code review | `gpt-5.6-sol` | deep | strongest healthy model at deep tier |

## Design choice: curated pools, live decisions

`POOLS` holds a handful of hand-exercised models per tier. Everything *within* a pool is
decided live — price, health, endpoint support, vision support, context, degradation — but
caller traffic is never sent to an untested long-tail model. Pools are the part a human
vouches for; the routing decision is the part the agent makes. Swapping a pool entry is a
one-line change.

## Deploy

1. Fork the standalone [Triage Router repository](https://github.com/xiaotian1171/triage-router), which has `agent.ts` at its root.
2. In [My Models](https://enter.pollinations.ai/my-models), choose **Add Agent → Code agent** and enter your fork's URL.
3. Edit `agent.ts`, push, then use **Sync** in the dashboard (or the workflow below).

`npx @pollinations/cli agents sync <agent-id>` deploys the newest default-branch revision.

For automatic sync after a push, enable GitHub Actions and set the repository **variable**
`POLLINATIONS_SYNC_URL` to `https://gen.pollinations.ai/account/agents/YOUR_AGENT_ID/sync`.

## Test

```bash
node --test agent.test.ts
```

The tests drive the agent with a fake `pollinations` helper and cover tier selection,
endpoint-aware selection, chat-body conversion, image-preserving escalation, vision
filtering, degradation avoidance, traces, streaming and request pass-through.

[Agent guide](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md) · [More examples](https://github.com/orgs/pollinations/repositories?q=topic%3Apollinations-code-agent-example)
