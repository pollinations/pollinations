# value-router

A minimal code agent for [Pollinations](https://pollinations.ai) that picks, for
each request, the cheapest healthy, fast-enough model that satisfies the request's
difficulty and capability needs, then forwards the conversation unchanged. Callers
see only the chosen model's answer.

## How routing works

- Classify the request in plain code (no router model call: cheap, fast,
  deterministic). Detects images/video, tool calling, long prompts, and code or
  reasoning keywords to produce a tier: `fast`, `balanced`, or `deep`.
- Pull live data in parallel through `pollinations()`:
  - `GET /v1/models` - price, capabilities, context length.
  - `GET /models/status?minutes=30` - per-model health and p95 latency.
- A model is skipped when it 5xx-failed a majority of its recent calls (with a
  minimum-traffic guard), when its p95 latency exceeds 60s, when it cannot satisfy
  the request's capability needs (image input, tool calling, reasoning, context
  length), or when it is a community agent (no router-to-router loops).
- Rank the eligible models by price, then p95 latency. Pick the cheapest for `fast`,
  the median-priced for `balanced`, and the strongest (priciest) for `deep`.
- Forward the original body to `/v1/responses` with only `model` replaced. The
  gateway still applies the chosen model's own declared fallbacks; this agent
  chooses between models, it does not retry one.

## Verifying the routing

Every response carries trace headers:

```
x-value-router-model: <chosen model>
x-value-router-tier:  fast | balanced | deep
x-value-router-why:   <one-line reason: tier, constraints, cost rank, cost, latency>
```

Five requests routed differently, with reasons, in [`demos/`](demos/).

## Deploy your own

1. Fork the [value-router repository](https://github.com/Marcus-Mok-GH/value-router).
2. In [My Models](https://enter.pollinations.ai/my-models), choose
   **Add Agent -> Code agent** and enter your fork's URL - or run
   `npx @pollinations/cli agents create --config code-agent.json`.
3. Edit `agent.ts`, push, then **Sync** in the dashboard to deploy the update.

## Test

```bash
node --experimental-strip-types --test agent.test.ts   # Node 22+
```

[Agent guide](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md)