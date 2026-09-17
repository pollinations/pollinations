# Live demos

Three requests against the deployed agent `afanasevmylife/polyrouter`
(`POST https://gen.pollinations.ai/v1/responses`), each routed differently.
The full Responses JSON, including the `polyrouter_trace` field, is in each
file. Re-run on 2026-09-17 after the platform's status-feed refactor (the
catalog no longer carries `health`; the router now aggregates
`/models/status` rollup rows itself).

## 1. Simple prompt -> fast tier -> cheapest eligible model

`demo-1-fast.json` - "Name the capital of Portugal in one word please."

```json
"polyrouter_trace": {
  "model": "community/morriszdweck/osaii-swarm",
  "tier": "fast",
  "why": "score 0; simple prompt; picked cheapest eligible of 49; skipped 108 no responses endpoint, 54 not a text model"
}
```

A trivial question takes a free community model. (Answer: "Lisbon".)

## 2. Code + reasoning prompt -> deep tier -> strongest eligible reasoning model

`demo-2-deep.json` - "Analyze why this concurrent queue implementation
deadlocks under load and explain step by step how to refactor the locking
strategy..."

```json
"polyrouter_trace": {
  "model": "community/pollinations-router/midijourney",
  "tier": "deep",
  "why": "score 4; code, reasoning keywords; picked strongest eligible of 33; skipped 16 no reasoning, 108 no responses endpoint, 54 not a text model"
}
```

Code fences plus reasoning keywords push the request to `deep`; the priciest
model advertising `reasoning` that is not flagged broken by the live status
feed answers.

## 3. Tool-using request -> balanced tier -> median-priced tool_calling model

`demo-3-balanced-tools.json` - "What is the weather in Lisbon right now?"
with a `get_weather` function tool attached.

```json
"polyrouter_trace": {
  "model": "community/sharktide/3D-agent",
  "tier": "balanced",
  "why": "score 0; simple prompt; has tools; picked median-priced eligible of 46; skipped 108 no responses endpoint, 54 not a text model, 3 no tool_calling"
}
```

The prompt is simple, but the attached tool requires `tool_calling`, so the
request is at least `balanced` and lands on the median-priced tool-capable
model.

## Note on where the trace is visible

Call the agent through `/v1/responses` to see `polyrouter_trace` in the body.
The gateway strips upstream response headers, and its Responses -> Chat
Completions conversion drops unknown body fields, so on
`/v1/chat/completions` the trace is not visible (reported as alpha feedback
in issue #15017).
