# Bee API, scopes, and billing proposal

Goal: developers deploy agent backends as easily as apps. An app can be just a
frontend; the bee is the portable backend.

## Two runtime kinds

Expose one simple default and one explicit advanced runtime. Providers are
implementation details.

| runtime.kind | default provider | use when | state backend | cost shape |
|---|---|---|---|---|
| `worker` | Cloudflare Agents | TypeScript agent, HTTP surfaces, small state, no shell | `sqlite` / `durable-object` / `kv` | per run + storage |
| `container` | Daytona/container first, AgentCore as alternate | shell, filesystem, coding agents, long jobs, package installs | `memory` plus external store, or provider storage | runtime minutes + storage + runs |

Manifest:

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

`runtime.provider = auto` resolves from `runtime.kind`:

- `worker` → `cloudflare-agents`
- `container` → `daytona` initially; can later route to `aws-agentcore` or another container provider

Advanced users can override:

```json
{ "runtime": { "kind": "container", "provider": "aws-agentcore" } }
```

## Control-plane API

Deploy/manage bees:

```text
POST   /v1/bees
GET    /v1/bees
GET    /v1/bees/{id}
PATCH  /v1/bees/{id}
DELETE /v1/bees/{id}
GET    /v1/bees/{id}/events
```

Run bees through a canonical API:

```text
POST /v1/bees/{id}/runs
```

Projected surfaces are generated from the same deployment:

```text
/bees/{id}/v1/chat/completions
/bees/{id}/web/messages
/bees/{id}/discord/messages
/bees/{id}/.well-known/agent-card.json
/bees/{id}/a2a
```

CLI:

```bash
polli bees init
polli bees validate bee.json
polli bees deploy bee.json
polli bees deploy bee.json --runtime daytona
polli bees status bee_id
polli bees events bee_id
polli bees delete bee_id
```

## Scopes

There are two actors: bee developers and bee users.

### Developer/admin scopes

These are needed for keys that deploy or manage bees:

```text
bees:read
bees:write
bees:delete
bees:logs
```

`bees:write` can create deployments and update manifests. `bees:delete` is
separate because deleting a public backend is destructive. `bees:logs` is
separate because logs can contain user data.

The existing `keys` scope should not imply bee deploy rights. Creating an App
Key remains a keys/account operation; deploying a bee is a runtime operation.

### End-user invocation scopes

Users invoking a user-pays bee should not grant deployment scopes.

For BYOP/user-pays invocation, request the smallest generation scope already
used by BYOP/device flow:

```text
generate
```

Only request `profile` if the bee needs profile fields. Only request `usage` if
the frontend shows account-wide balance/usage. Most user-pays bees should not
need `usage`, `keys`, or any `bees:*` scope.

## Billing

Everything charges Pollen, with two billing routes:

| mode | payer | use case |
|---|---|---|
| `user-pays` | invoking user BYOP key | public apps, Discord bots, viral frontends |
| `author-pays` | bee owner key/balance | demos, internal automations, sponsored bots |

Meters:

| meter | worker bee | container bee |
|---|---|---|
| model/tool calls | pass through existing Pollinations pricing | pass through existing Pollinations pricing |
| orchestration run | small per-run platform fee | per-run platform fee |
| compute | included or tiny CPU-duration meter | runtime minutes while active/warm |
| storage | included small quota, then GB-day/retention | workspace GB-day + snapshots |
| creator markup | BYOP markup can credit app/bee author | same |

Practical v1:

- Show estimated cost in `polli bees deploy --dry-run`.
- Give `worker` bees a small included storage/runtime allowance.
- Bill `container` bees by active session minute, with auto-stop defaults.
- Let `retentionDays` be customer-controlled and billable.
- Attribute user-pays traffic through the App Key `clientId`.

## Recommendation

Ship:

1. `runtime.kind: "worker"` first, backed by Cloudflare Agents.
2. `runtime.kind: "container"` second, backed by Daytona/container; AgentCore
   remains an alternate provider behind the same runtime kind.

This keeps the developer promise simple:

> Add `bee.json`, run `polli bees deploy`, get URLs. Override runtime only when
> the bee actually needs a full computer.
