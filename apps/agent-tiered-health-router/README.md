# Tiered health router

A [code agent](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md)
that classifies each request by how demanding it is, then picks the model for
that tier live from the catalog and its recent health — not from a hardcoded
model list.

## How it routes

1. A cheap classifier call (`openai/gpt-5.4-nano`) reads the request (as
   inert data, never as instructions to follow) and labels it `FAST`,
   `BALANCED`, or `DEEP`.
2. In parallel, the agent fetches the live model catalog (`/v1/models`) and
   the last 30 minutes of health (`/models/status?minutes=30`).
3. Eligible text models are split into three price bands (cheapest third /
   middle third / top third); `DEEP` additionally prefers models whose
   `capabilities` include `"reasoning"` when the top band has any.
4. Within the chosen band, prefer models with a 5xx rate at or below 10%
   over at least 10 requests, ordered by error rate then p95 latency.
   Otherwise try models with too little traffic to judge, then the least
   unhealthy candidate.
5. If the request includes an image, audio, or video part, the candidate
   pool is filtered to models whose `input_modalities` actually support it,
   before the price/health selection above runs. Tool requests require
   `tool_calling`. Agents are excluded to avoid routing loops; an empty
   compatible pool returns an error rather than dropping these requirements.
6. The request is forwarded to `/v1/responses` with only the `model` field
   changed — everything else the caller sent passes through untouched.

Gen already retries a model's own declared fallback chain, so this router
doesn't retry on error; its job is choosing well up front, not recovering
after the fact.

## Why this axis

The three example submissions already public on this issue route by live
free-model health, by code-only complexity scoring, and by a capability-fit
price ladder with retry escalation. This one routes by *task difficulty*,
judged by a real model reading the request rather than a length/keyword
heuristic — closer to how a person would triage the same three requests —
and then still resolves that tier against live pricing and health instead of
three hardcoded model IDs, so it doesn't go stale as the catalog changes.

## Trace

Every request logs a structured line:

```json
{"router":"tiered-health-router","tier":"DEEP","model":"x-ai/grok-4.3","reason":"DEEP: 0.4% 5xx over 812 requests (last 30m)"}
```

`X-Router-Tier` and `X-Router-Model` are also set on the response, for
callers who can read response headers directly. In this deployment, neither
the headers nor a way to view the agent's own `console.log` output were
visible through `curl`/the dashboard (see Alpha feedback below) — the model
that actually answered is still visible in the raw Responses JSON's
top-level `"model"` field, which is what the demos verify against.

## Deploy

Live at **`community/tomdacatto/tiered-health-router`**, deployed from
[tomdacatto/tiered-health-router](https://github.com/tomdacatto/tiered-health-router).

1. Fork/copy this file to your own public GitHub repository (one file,
   `agent.ts`, at the root).
2. In [My Models](https://enter.pollinations.ai/my-models), **Add Agent →
   Code agent**, and enter your repository's URL.
3. Call it like any model: `model: "<your-github-username>/<repo-name>"`
   (this dashboard listed it as `community/<username>/<repo-name>`).

## Demos

See [`demos/`](./demos) for three real requests against the live deployment,
each landing on a different model.

## Alpha feedback

- **Response headers don't survive on `/v1/responses` either.** #15041's PR
  on this issue reported that custom response headers are dropped specifically
  by the Chat Completions conversion. Testing this agent's `X-Router-*`
  headers against `/v1/responses` directly (not through that conversion) —
  they were absent there too. There also doesn't appear to be a dashboard
  view of a code agent's own `console.log` output, so right now neither
  channel this quest suggests for a routing trace ("a header, log, or short
  trace") is independently checkable by a caller — only the `model` field
  already present in the raw response is.
- **A catalog model's declared `input_modalities` can be optimistic.**
  `GET /v1/models` lists `image` in `mistralai/mistral-large-3`'s
  `input_modalities`, but a live `/v1/responses` call routed to it with an
  `input_image` part failed with `"Model 'Mistral-Large-3' does not support
  image inputs"` from the upstream provider. A router (this one included)
  that trusts `input_modalities` for modality filtering can still pick a
  model that rejects the request — worth a periodic capability check against
  what the catalog declares, independent of any one router's own logic.
