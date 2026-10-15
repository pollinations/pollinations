# Live demos

Three requests against the deployed agent `afanasevmylife/polyrouter`
(`POST https://gen.pollinations.ai/v1/responses`), each routed differently.
The full Responses JSON, including the `polyrouter_trace` field, is in each
file. Re-run on 2026-09-17 after the platform's status-feed refactor (the
catalog no longer carries `health`; the router now aggregates
`/models/status` rollup rows itself) and after excluding published agents
from routing targets.

## 1. Simple prompt -> fast tier -> cheapest eligible model

`demo-1-fast.json` - "Name the capital of Portugal in a single word."

```json
"polyrouter_trace": {
  "model": "openai/gpt-oss-20b",
  "tier": "fast",
  "why": "score 0; simple prompt; picked cheapest eligible of 31; skipped 106 no responses endpoint, 54 not a text model, 18 community agent"
}
```

A trivial question takes the cheapest non-broken real model. (Answer:
"Lisbon".)

## 2. Code + reasoning prompt -> deep tier -> strongest eligible reasoning model

`demo-2-deep.json` - "Analyze why this concurrent stack implementation
corrupts data under contention and walk step by step through refactoring its
synchronization..."

```json
"polyrouter_trace": {
  "model": "openai/gpt-6-astra",
  "tier": "deep",
  "why": "score 4; code, reasoning keywords; picked strongest eligible of 26; skipped 5 no reasoning, 106 no responses endpoint, 54 not a text model, 18 community agent"
}
```

Code fences plus reasoning keywords push the request to `deep`; the priciest
model advertising `reasoning` that is not flagged broken by the live status
feed answers.

## 3. Tool-using request -> balanced tier -> median-priced tool_calling model

`demo-3-balanced-tools.json` - "What is the weather like in Lisbon today?"
with a `get_weather` function tool attached.

```json
"polyrouter_trace": {
  "model": "cohere/command-a-plus",
  "tier": "balanced",
  "why": "score 0; simple prompt; has tools; picked median-priced eligible of 31; skipped 106 no responses endpoint, 54 not a text model, 18 community agent"
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
