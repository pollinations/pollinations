# Ladder Router — a cascade code agent

A code agent for [#15017](https://github.com/pollinations/pollinations/issues/15017):
it picks which model answers each request, then answers as that model.

**Routing idea (different from the other submissions): capability-fit
ladder + cross-model escalation.** No LLM call is spent on routing:

1. Fetch the live catalog (`/v1/models?status=all`) on every request —
   no hardcoded model list.
2. Keep text models serving the incoming endpoint, healthy first
   (`healthy` → `unknown` → `degraded`, never `unavailable` unless
   nothing else exists), sorted by live price.
3. Fit the request: vision-capable cheapest for image requests,
   large-context cheapest for inputs over ~20k chars, otherwise the
   cheapest healthy text model.
4. Try up to 3 in order; on 429 / 5xx / timeout escalate to the next.
   The trace lists every attempt plus the reason, prepended to the
   answer body (headers are stripped by the gateway, so the trace
   travels in the body and survives on every endpoint).

Streaming requests are forwarded to the first ladder pick unchanged.

## Deploy

Source repo (public, `agent.ts` at root): `https://github.com/ammarelshaf3y/ladder-router`

```bash
npx @pollinations/cli agents create --config code-agent.json --name ladder-router
npx @pollinations/cli agents sync <agent-id>
```

(`create` alone does not deploy code agents — a manual `sync` is
required; see alpha feedback in the PR.)

## Verify

Three differently-routed live demos are in `demos/demo.md`:
short text → cheapest, image request → cheapest vision model,
long document → large-context model. Each shows the trace.
