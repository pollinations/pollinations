# Bees reference implementations

Experimental references for Pollinations-hosted bees. The goal is to compare
deployment shapes before choosing a production path.

## Implementations

| folder | purpose | when it wins |
|---|---|---|
| `musician-booking-reference` | large integrated reference | proves surfaces, billing seam, state, deploy API, and provider adapters can share one core |
| `minimal-cloudflare-agents` | smallest Cloudflare Agents SDK bee | stateful TypeScript bees that should live close to `gen.pollinations.ai` |
| `minimal-daytona-container` | smallest workspace/container bee | bees that need shell, filesystem, package installs, or coding-agent style tools |
| `minimal-aws-agentcore` | smallest AgentCore HTTP bee | AWS-credit experiments and AgentCore session/runtime evaluation |
| `customer-deploy-reference` | API/CLI control-plane sketch | customer-owned deployment flow, manifests, status/events, provider selection |
| `minimal-frontend` | tiny app frontend | shows an app as a thin UI over a deployed bee backend |

## Current bias

Start production with `runtime.kind = "worker"` and `runtime.provider = "auto"`.
That maps to Cloudflare Agents first. Keep `runtime.kind = "container"` as the
explicit advanced path for Daytona, AgentCore, or generic containers when a bee
needs a full runtime.

## API direction

The emerging customer-facing shape is:

```text
POST   /v1/bees
GET    /v1/bees
GET    /v1/bees/{id}
GET    /v1/bees/{id}/events
PATCH  /v1/bees/{id}
DELETE /v1/bees/{id}
```

CLI equivalent:

```bash
polli bees init
polli bees validate bee.json
polli bees deploy bee.json
polli bees deploy bee.json --runtime daytona
polli bees list
polli bees status bee_id
polli bees events bee_id
polli bees delete bee_id
```

The manifest should stay provider-neutral but allow an explicit runtime:

```json
{
  "name": "booking-assistant",
  "source": { "type": "git", "repository": "https://github.com/me/bee.git" },
  "runtime": { "kind": "worker", "provider": "auto" },
  "state": { "backend": "sqlite", "retentionDays": 7 },
  "surfaces": ["openai", "web", "a2a"],
  "billing": { "mode": "user-pays", "clientId": "pk_app_key" }
}
```

Each reference implementation now has a `bee.json` so the same contract can be
tested across integrated and minimal examples.

See `api-scopes-billing.md` for the current API/scope/billing proposal. The
short version: ship one default (`worker`) and one advanced override
(`container`). Hide provider choice behind `runtime.provider = "auto"` until a
developer needs to pin Daytona, AgentCore, or a generic container target.
