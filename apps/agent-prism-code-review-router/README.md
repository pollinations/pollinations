# Prism — wallet-aware engineering router

A code agent tuned for code review, debugging and architecture. It classifies locally, then selects a model using live capabilities, health, prices and the caller's visible balance. No extra classifier call.

Source and deployment: [cesus-agent/prism-code-review-router](https://github.com/cesus-agent/prism-code-review-router).
Callable name from the author's submission: `cesus-agent/prism-code-review-router`.
Addresses [quest #15017](https://github.com/pollinations/pollinations/issues/15017).

## Routing

- Security-sensitive and large engineering requests go deep; ordinary reviews and planning go balanced; small questions go fast.
- Reads `/account/balance` using the caller's delegated authority. If unavailable, selection proceeds without wallet information.
- Excludes agents, unknown prices, unhealthy models and models that cannot handle the endpoint, context, images or caller tools.
- Prefers models whose estimated request cost fits half the visible balance. If none fit, chooses the cheapest eligible estimated request.
- Fast/balanced prefer explicitly zero-priced models when available, then low/median prices. Deep prefers reasoning and context within the affordable pool.
- Appends the author's engineering-review rubric on balanced/deep requests. Conversation roles, tool calls and results otherwise remain unchanged.
- Catalog failure or no compatible candidates fails explicitly. Optional health-feed failure does not prevent routing.

**The wallet budget is a routing estimate, not a guaranteed spending cap.** Token estimates omit media-specific costs and can differ from real usage. The gateway remains responsible for permissions, key budgets and billing. Missing token prices never mean a model is free.

## Trace and tests

Each request logs its selection and sets `x-pollinations-router-model`, `x-pollinations-router-tier` and `x-pollinations-router-reason`. Gateway conversions may remove custom headers; this is not a guaranteed public trace API.

Run `node --test agent.test.ts` with a current Node.js release.
Tests cover image/tool selection, agent and unknown-price exclusion, wallet-aware choices, degradation, unavailable balance/health, structured history and SSE forwarding.

## Deploy

Copy this example's `agent.ts` to the author's standalone repository, then sync the existing code agent. Merging here does not update the standalone deployment.

```bash
curl https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"cesus-agent/prism-code-review-router","input":"Review this small function for bugs."}'
```

The submission's original live demonstrations covered small code questions, review and a security audit. Rerun them after syncing: model availability, prices and health change.
