# Bee deployment API sketch

Reference contract for letting users deploy their own bees. This is not wired
into `gen.pollinations.ai` yet; it exists so provider experiments can converge
on one shape.

## Create deployment

`POST /v1/bees`

```json
{
  "name": "booking-assistant",
  "source": {
    "type": "git",
    "repository": "https://github.com/example/booking-bee.git",
    "ref": "main",
    "packagePath": "bees/booking"
  },
  "runtime": {
    "kind": "worker",
    "provider": "auto"
  },
  "state": {
    "backend": "sqlite",
    "retentionDays": 7
  },
  "surfaces": ["openai", "web", "discord", "a2a"],
  "billing": {
    "mode": "user-pays",
    "clientId": "pk_app_key",
    "dailyPollenLimit": 5
  },
  "env": {
    "PUBLIC_AGENT_NAME": "Booking Assistant"
  }
}
```

`202 Accepted`

```json
{
  "id": "bee_booking-assistant",
  "name": "booking-assistant",
  "status": "queued",
  "runtime": {
    "kind": "worker",
    "provider": "cloudflare-agents",
    "requestedProvider": "auto"
  },
  "state": {
    "backend": "sqlite",
    "retentionDays": 7
  },
  "requiredScopes": {
    "developer": ["bees:read", "bees:write", "bees:logs"],
    "invocation": ["generate"]
  },
  "billingEstimate": {
    "currency": "pollen",
    "mode": "user-pays",
    "dailyPollenLimit": 5,
    "meters": [
      {
        "name": "model_tool_calls",
        "payer": "user-pays",
        "unit": "existing_pollinations_pricing"
      },
      { "name": "orchestration_run", "payer": "user-pays", "unit": "per_run" },
      { "name": "state_retention", "payer": "user-pays", "unit": "gb_day_after_included_quota" }
    ]
  },
  "surfaces": [
    {
      "kind": "openai",
      "url": "https://gen.pollinations.ai/bees/bee_booking-assistant/v1/chat/completions"
    },
    {
      "kind": "a2a",
      "url": "https://gen.pollinations.ai/bees/bee_booking-assistant/.well-known/agent-card.json"
    }
  ],
  "createdAt": "2026-05-03T00:00:00.000Z",
  "updatedAt": "2026-05-03T00:00:00.000Z"
}
```

## Deployment lifecycle

- `POST /v1/bees` creates a queued deployment.
- `GET /v1/bees` lists deployments owned by the developer key.
- `GET /v1/bees/{id}` returns status and surface URLs.
- `GET /v1/bees/{id}/events` streams build/provisioning events.
- `PATCH /v1/bees/{id}` updates env, surfaces, billing, retention, or runtime.
- `DELETE /v1/bees/{id}` disables routes and schedules provider cleanup.

`src/deploy-api/server.ts` contains an in-memory reference router for these
routes. Production would replace the store with Enter-backed ownership,
quotas, audit logs, and provider job records.

## Runtime mapping

| runtime.kind | provider | backend | state |
|---|---|---|---|
| `worker` | `cloudflare-agents` | Worker + Durable Object | `sqlite`, `durable-object`, or `kv` |
| `container` | `daytona` | workspace/container | `memory` plus workspace/provider storage |
| `container` | `aws-agentcore` | AgentCore Runtime container | `memory` plus external store |
| `container` | `container` | plain Node HTTP server | provider-defined |

Cloudflare has two references in this package:

- `wrangler.toml` + `src/providers/cloudflare/worker.ts`: explicit Worker
  router + Durable Object.
- `wrangler.agents.toml` + `src/providers/cloudflare/agents-sdk.ts`:
  Cloudflare Agents SDK `Agent` class with `onRequest(...)`.

## Billing

`billing.mode = "user-pays"` means the runtime must attach the Enter/BYOP
authorization hook before the bee receives the message. Missing keys return 402
with an authorization URL. Valid keys resolve to a Pollinations user id used for
per-user state and spend attribution.
