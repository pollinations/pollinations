# Constraint Router

Constraint Router turns every request into a small capability contract before it considers price. It checks the live Pollinations catalog and 30-minute health window, filters out models that cannot satisfy the request, then chooses a healthy model for one of five profiles:

- `vision`: image input requires a vision model.
- `format`: strict JSON or another structured response requires format support.
- `deep`: long or complex work requires reasoning capability.
- `speed`: short or urgent work minimizes live p95 latency.
- `economy`: ordinary text minimizes estimated request cost.

The selected model answers the original request. Its first line is a short trace such as `[route: model/id | speed: ...]`, so the decision is visible even when gateways strip custom headers.

## Safety and fallback behavior

- User content is inspected only for deterministic request signals; it cannot supply a model ID.
- Community agents are excluded to avoid agent-to-agent routing loops.
- Models marked down, missing required capabilities/context, or showing more than 10% 5xx errors after 10 requests are excluded.
- Deep routing uses a conservative estimated 0.02-Pollen request budget before preferring a stronger reasoning candidate.
- If the live status endpoint is unavailable, catalog health and capability data still drive selection.

## Test

```bash
node --test agent.test.ts
```

The tests demonstrate three different decisions: live-latency text, structured JSON, and deep reasoning.

## Live deployment

- Source repository: pending public test deployment
- Callable model: pending private code-agent registration
- Live demonstrations: pending
