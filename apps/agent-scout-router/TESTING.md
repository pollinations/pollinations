# Live test evidence — scout-router

Agent: `rekty/scout-router` (agent id `22a87097-ea6c-41fe-9343-b828e45ce112`, deployed commit `c613645a5fabba6849d57ebd82f066bc256371e1`).
All requests go to `POST https://gen.pollinations.ai/v1/responses` with the account key of `rekty`. Each request is an independent conversation. The `scout_trace` field in each response is produced by the agent (see `agent.ts`, `decorate()`).

Unit tests: 15/15 passing (`node --test agent.test.ts`, Node ≥ 23).

## Request 1 — EASY → cheapest healthy model

Input: `"Greet a friend named Putri in one warm sentence."`

```json
{
  "tier": "EASY",
  "signals": ["short-simple"],
  "chosen": "qwen/qwen3.7-flash",
  "escalations": [],
  "est_cost_pollen": 0.000100225,
  "health_pct": 100,
  "tps": 70
}
```

Why: short-simple chat → cheapest healthy candidate; qwen3.7-flash was the lowest estimated cost among candidates that passed the health gate (cheaper agent models such as `community/xiaotian1171/triage-router` publish no token pricing and are excluded).

## Request 2 — HARD → strongest healthy model

Input: `"Design a URL shortener for a global scale.\n```\nbase62 id sketch\n```\n```\nhash collision sketch\n```\nAnalyze the trade-offs of each design and derive the storage strategy."`

```json
{
  "tier": "HARD",
  "signals": ["multi-code-blocks", "reasoning-keywords"],
  "chosen": "openai/gpt-5.5",
  "escalations": [],
  "est_cost_pollen": 0.015,
  "health_pct": 100,
  "tps": 66
}
```

Answer (excerpt): *"## Goals and assumptions — Design a CDN-aware caching layer for an API where: Responses are mostly GET/HEAD…"* (a re-run with a CDN-cache variant produced a full substantive design).

Why: two code fences plus architecture keywords → HARD tier → the quality proxy (price + 2M context + health) picks a frontier model.

## Request 3 — MEDIUM (vision) → image-capable model

Input: image part (`input_image`, picsum seed) + `"Describe this photo in one sentence."`

```json
{
  "tier": "MEDIUM",
  "signals": ["image"],
  "chosen": "openai/gpt-5-nano",
  "escalations": [],
  "est_cost_pollen": 0.0001875,
  "health_pct": 100,
  "tps": 191
}
```

Answer: *"A lone surfer walks along a misty, black-and-white beach, carrying a surfboard toward the calm, foamy waves."*

Why: the image signal filters candidates to image-input models only, then the MEDIUM value score picks the cheapest/fastest healthy one. Text-only models were never considered.

## Escalation path

Covered by unit test ("agent: escalates to the next candidate when the chosen model fails"): a 500 from the top candidate escalates to the second-best and the failed model is demoted for 10 minutes (`x-scout-trace` shows `escalations: ["cheap/mini:500"]`).

## Alpha findings (also filed in the PR)

- The gateway strips custom response headers (`x-scout-*`) and unknown fields on `/v1/chat/completions`, but preserves unknown top-level fields on `/v1/responses` — that is why the trace rides in the JSON body there.
- Agent models (e.g. other routers) often publish **no token pricing**, which makes cost-based routers treat them as free and can route callers into another router — scout-router excludes `community/*` ids and unpriced models for this reason.
- Gateways cache identical agent requests; vary wording when testing routing.
