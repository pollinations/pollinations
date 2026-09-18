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
4. Within the chosen band, the agent drops models over a 10% 5xx rate in the
   last 30 minutes (ignoring rows with fewer than 10 requests — too little
   traffic to mean anything) and picks the fastest (lowest p95 latency)
   survivor.
5. If the request includes an image, audio, or video part, the candidate
   pool is filtered to models whose `input_modalities` actually support it,
   before the price/health selection above runs.
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

`X-Router-Tier` and `X-Router-Model` are also set on the response. These
survive on `/v1/responses`; the gateway's Chat Completions conversion drops
non-standard headers, so the log line is the reliable way to check routing
on `/v1/chat/completions`.

## Deploy

1. Fork/copy this file to your own public GitHub repository (one file,
   `agent.ts`, at the root).
2. In [My Models](https://enter.pollinations.ai/my-models), **Add Agent →
   Code agent**, and enter your repository's URL.
3. Call it like any model: `model: "<your-github-username>/<repo-name>"`.

## Demos

See [`demos/`](./demos) for three requests that land in different tiers,
with the actual routing evidence from a live deployment.
