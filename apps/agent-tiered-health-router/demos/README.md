# Demos

Three requests picked to land in different tiers. Replace `YOUR_MODEL` with
`<your-github-username>/<repo-name>` and `$POLLINATIONS_API_KEY` with a real
key, then paste the actual `X-Router-*` headers (or the logged trace line
from your agent's dashboard) below each one as evidence.

## 1. FAST — a simple factual question

```bash
curl -is https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "YOUR_MODEL",
    "input": "What is the capital of Iceland? One word.",
    "store": false
  }' | grep -i x-router
```

Expected tier: `FAST`.

## 2. BALANCED — an everyday coding question

```bash
curl -is https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "YOUR_MODEL",
    "input": "Write a Python function that merges two sorted lists into one sorted list, with a short docstring.",
    "store": false
  }' | grep -i x-router
```

Expected tier: `BALANCED`.

## 3. DEEP — a hard, multi-step design question

```bash
curl -is https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "YOUR_MODEL",
    "input": "Design a rate limiter for a multi-region API gateway that must stay correct under clock skew between regions and survive a region failing over mid-window. Walk through the failure modes and your chosen approach.",
    "store": false
  }' | grep -i x-router
```

Expected tier: `DEEP`.

Wording matters more than length here — Gen caches identical request bodies,
so re-running the exact same prompt replays the earlier response instead of
routing again. Vary the wording between runs when re-testing.
