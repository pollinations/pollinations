# frugal — cost-first, health-aware model router

A Pollinations **code agent** that routes every request to the cheapest healthy
model that can actually serve it — and shows why, in a trace.

Callable model: **`fadyabohamza-netizen/frugal`**

```
curl https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "fadyabohamza-netizen/frugal",
    "instructions": "Answer directly.",
    "input": "What is 2+2?"
  }'
```

The chosen model appears in the `X-Frugal-Model` header and in the platform log;
when a trace survives to the caller it names the tier, the model, the estimated
token counts, the pre- and post-health-adjusted estimated cost, and how many
candidates it was chosen from.

## What makes it different

1. **True per-request cost, not a unit price.** Most routers rank models by a
   static per-token price. `frugal` estimates the cost of *this request*:
   measured input length → input tokens, plus an output-token estimate that
   scales with task difficulty (128 for simple, 512 for everyday, 2048 for
   deep). Cheapest **for the actual job**, not cheapest on paper.

2. **Zero-LM routing.** The tier decision (FAST / BALANCED / DEEP) is a pure
   code heuristic — prompt length, code fences, reasoning keywords, long-form
   asks, conversation continuation, presence of images or tools. Routing costs
   nothing and adds no latency: no classifier model call, no tokens spent on
   the router itself.

3. **Continuous health penalty instead of a hard ban.** Models with recent 5xx
   errors are *penalized* (up to 5× estimated cost) rather than excluded, so a
   model briefly flaky stays available when nothing else fits — but a healthy
   model of similar price always wins. Only genuinely dead models (≥15% 5xx or
   zero 2xx with real traffic) are dropped. Health comes live from
   `/models/status?minutes=30`; capability fit (`/v1/responses`, image input,
   `tool_calling`) comes from `/v1/models`.

4. **Tier slices from the live ranked catalog.** Candidates are ranked by
   health-adjusted cost and split into thirds: FAST takes the cheapest third,
   BALANCED the middle, DEEP the most capable. Empty slices widen outward, and
   an empty catalog falls back to a sane default — the router degrades, never
   crashes.

5. **Foundation models only.** `community` entries (games, agents, tests) are
   filtered out — they distort cost ranking and are unpredictable. The router
   never routes to itself or to other agents; every candidate is a real
   price-listed `/v1/responses` model.

## Design

| Step | Inputs | Output |
|------|--------|--------|
| Classify | `input`, `instructions`, `tools`, `max_output_tokens`, `previous_response_id` | `FAST` / `BALANCED` / `DEEP`, is_long flag |
| Fetch | `pollinations("/v1/models")` + `pollinations("/models/status?minutes=30")` in parallel | catalog + per-model rollup health |
| Filter | category `text`, `/v1/responses` endpoint, modality fit (image), `tool_calling` when tools sent | eligible candidates |
| Rank | `input_tokens × prompt_price + output_tokens × completion_price`, then × health penalty | sorted health-adjusted cost |
| Slice | thirds by ranking | tier candidate slice |
| Emit | `console.log` JSON trace + `X-Frugal-*` headers | trace |

## Verifying three differently-routed requests

Three live requests on 2026-09-20 routed to **three different models**, each
with a different tier and cost (live `/v1/models` + `/models/status?minutes=30`):

| Request | Tier | Model chosen | Health-adjusted est. cost | Live answer |
|---------|------|--------------|---------------------------|-------------|
| `"What is 2+2?"` | FAST | `openai/gpt-oss-20b` | 0.000023 pollen ×1.00 (cheapest of 11) | `4` |
| Calculator tool: multiply 6×7 | BALANCED | `mistralai/mistral-large-3` | 0.000578 pollen ×1.15 (cheapest of 11) | `42` (tool executed) |
| Prove Pythagorean theorem + design self-synthesizing AI | DEEP | `z-ai/glm-5.3` | 0.009056 pollen ×1.15 (cheapest of 9) | full proof + design |

The chosen model is emitted as a `console.log` JSON trace and, when the caller
sees a trace, in the `X-Frugal-*` response headers. Note: identical request
bodies are served from the platform cache, so vary wording between demos.

## Unit tests

`node --experimental-strip-types --test`-compatible suite (21 assertions):
classification, token/cost math, health penalties, and that self / unpriced /
community models never win.

## Files

- `agent.ts` — the router, self-contained, no imports. Pure `Request`/`Response`
  Worker API via `pollinations(path, init)`, so it satisfies the quest's
  "only `ai` and `@ai-sdk/openai-compatible` may be imported" constraint (it
  imports nothing).

## Deploy

Created from this public repository as a code agent:

```
npx @pollinations/cli agents create --config code-agent.json
```

with `code-agent.json`:

```json
{
  "type": "code_agent",
  "repository": "https://github.com/fadyabohamza-netizen/frugal"
}
```