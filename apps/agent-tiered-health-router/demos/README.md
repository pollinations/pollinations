# Demos

Three requests, deployed live as `community/tomdacatto/tiered-health-router`,
each landing on a different model. `X-Router-*` response headers and the
agent's `console.log` trace do not survive the round trip (see the Alpha
feedback in the top-level README) — the model actually used is still visible
in the raw Responses JSON's `"model"` field, which is what's quoted below.

## 1. FAST — a simple factual question

```bash
curl -s https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "community/tomdacatto/tiered-health-router",
    "input": "What is the capital of Iceland? One word.",
    "store": false
  }'
```

**Model used: `qwen/qwen3.7-flash`** — the cheapest model in the eligible
catalog at test time. Answer: `Reykjavik`.

## 2. BALANCED — an analysis/comparison question

```bash
curl -s https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "community/tomdacatto/tiered-health-router",
    "input": "Compare read-through, write-behind, and write-around caching strategies for a read-heavy e-commerce product catalog. Recommend one and explain the tradeoff in 4-6 sentences.",
    "store": false
  }'
```

**Model used: `Mistral-Large-3`** — a distinctly different, mid-priced model
from the FAST pick, with a coherent comparison and recommendation in the
response.

(A first attempt at a coding-exercise prompt — "write a function that merges
two sorted lists" — was classified `FAST` rather than `BALANCED` and landed
on the same model as demo 1. The classifier judges difficulty from the
content, not a fixed rule per category, and a well-known one-line coding
exercise can reasonably read as simple. The comparison/recommendation prompt
above reliably reads as `BALANCED`.)

## 3. DEEP — a hard, multi-step design question

```bash
curl -s https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "community/tomdacatto/tiered-health-router",
    "input": "Design a rate limiter for a multi-region API gateway that must stay correct under clock skew between regions and survive a region failing over mid-window. Walk through the failure modes and your chosen approach.",
    "store": false
  }'
```

**Model used: `gpt-5.4`** — the strongest, most expensive of the three picks,
with a multi-paragraph distributed-systems answer (hybrid logical clocks,
per-region admission, replicated usage state).

Three requests, three different models, each visibly matched to how
demanding the request actually was.

Wording matters more than length here — Gen caches identical request bodies,
so re-running the exact same prompt replays the earlier response instead of
routing again. Vary the wording between runs when re-testing.
