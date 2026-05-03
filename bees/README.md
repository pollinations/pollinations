# Bees reference implementations

Experimental references for Pollinations-hosted bees. The goal is to compare
deployment shapes before choosing a production path.

Start with [`QUICKSTART.md`](./QUICKSTART.md) for the smallest deploy path and
the YAGNI questions to answer before adding more runtime/provider scope.

## Implementations

| folder | purpose | when it wins |
|---|---|---|
| `musician-booking-reference` | large integrated reference | proves surfaces, billing seam, state, deploy API, and provider adapters can share one core |
| `minimal-openai-wrapper` | smallest OpenAI-compatible bee | fixed system prompt over a base Pollinations model |
| `minimal-cloudflare-agents` | smallest Cloudflare Agents SDK bee | stateful TypeScript bees that should live close to `gen.pollinations.ai` |
| `minimal-daytona-container` | smallest workspace/container bee | bees that need shell, filesystem, package installs, or coding-agent style tools |
| `minimal-aws-agentcore` | smallest AgentCore HTTP bee | AWS-credit experiments and AgentCore session/runtime evaluation |
| `customer-deploy-reference` | API/CLI control-plane sketch | customer-owned deployment flow, manifests, status/events, provider selection |
| `minimal-frontend` | tiny app frontend | shows an app as a thin UI over a deployed bee backend |

## Current bias

Start production with no runtime field in `bee.json`. Missing runtime resolves
to `worker + auto`, which maps to Cloudflare Agents first. Keep
`runtime.kind = "container"` as the explicit advanced path for Daytona,
AgentCore, or generic containers when a bee needs a full runtime.

## API direction

The emerging customer-facing shape is:

```text
POST   /api/bees
POST   /api/bees?upgrade=1
GET    /api/bees
GET    /api/bees/{id}
GET    /api/bees/{id}/events
PATCH  /api/bees/{id}
DELETE /api/bees/{id}
```

CLI:

```bash
polli bees init
polli bees validate bee.json
polli bees deploy bee.json
polli bees deploy bee.json --upgrade
polli bees deploy bee.json --runtime daytona
polli bees list
polli bees status bee_id
polli bees events bee_id
polli bees delete bee_id --yes
```

`polli bees deploy --dry-run` is optional for CI/debugging. The happy path is
`polli bees deploy`, which uses the `/api/bees` API and returns the deployment
id plus projected surfaces.
Duplicate bee ids fail by default; pass `--upgrade` to redeploy the same id.

The common manifest should stay provider-neutral and omit runtime details:

```json
{
  "name": "booking-assistant",
  "source": { "type": "git", "repository": "https://github.com/me/bee.git" },
  "surfaces": ["openai", "web"],
  "billing": { "mode": "author-pays" }
}
```

Use `runtime.kind = "container"` only when the bee needs a shell, filesystem,
package installs, or long-running jobs.

Each reference implementation now has a `bee.json` so the same contract can be
tested across integrated and minimal examples. Every checked-in bee declares an
`openai` surface and can be invoked as an OpenAI-compatible chat-completions
agent through the regular `/v1/chat/completions` API once the platform projects
the bee into the model list.

See `api-scopes-billing.md` for the current API/scope/billing proposal. The
short version: ship one implicit default (`worker + auto`) and one advanced
override (`container`). Hide provider choice until a developer needs to pin
Daytona, AgentCore, or a generic container target.

See `storage-backends.md` for hot state vs. cold/archive memory.
