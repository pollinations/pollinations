# Live demos

Three requests against the deployed agent `afanasevmylife/polyrouter`
(`POST https://gen.pollinations.ai/v1/responses`), each routed differently.
The full Responses JSON, including the `polyrouter_trace` field, is in each
file.

## 1. Simple prompt -> fast tier -> cheapest healthy model

`demo-1-fast.json` - "Name the capital of Portugal, one word only."

```json
"polyrouter_trace": {
  "model": "community/morriszdweck/osaii-swarm",
  "tier": "fast",
  "why": "score 0; simple prompt; picked cheapest healthy of 34; skipped 2 health degraded, 109 no responses endpoint, 53 not a text model, 4 health unknown, 7 health down"
}
```

A trivial question takes a free, healthy community model. (Answer: "Lisbon".)

## 2. Code + reasoning prompt -> deep tier -> strongest healthy reasoning model

`demo-2-deep.json` - "Analyze why this TypeScript code can deadlock, explain
step by step, then refactor it..."

```json
"polyrouter_trace": {
  "model": "community/pollinations-router/midijourney",
  "tier": "deep",
  "why": "score 4; code, reasoning keywords; picked strongest healthy of 26; skipped 8 no reasoning, 2 health degraded, ..."
}
```

Code fences plus reasoning keywords push the request to `deep`; the priciest
healthy model advertising `reasoning` answers.

## 3. Tool-using request -> balanced tier -> median-priced tool_calling model

`demo-3-balanced-tools.json` - "What is the weather like in Lisbon right
now?" with a `get_weather` function tool attached.

```json
"polyrouter_trace": {
  "model": "meta/muse-glimmer-30b",
  "tier": "balanced",
  "why": "score 0; simple prompt; has tools; picked median-priced healthy of 34; skipped ..."
}
```

The prompt is simple, but the attached tool requires `tool_calling`, so the
request is at least `balanced` and lands on the median-priced healthy
tool-capable model.

## Note on where the trace is visible

Call the agent through `/v1/responses` to see `polyrouter_trace` in the body.
The gateway strips upstream response headers, and its Responses -> Chat
Completions conversion drops unknown body fields, so on
`/v1/chat/completions` the trace is not visible (reported as alpha feedback
in issue #15017).
