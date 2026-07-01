# bees/deploy-api — control-plane reference

Independent design for the bee deploy API, parallel to codex's `bees/customer-deploy-reference/` on PR #10636. The point isn't to compete; it's to give #10628 two designs to triangulate from before locking the schema.

Differences from codex's design — each one is a deliberate response to something I noticed reading their code (review on https://github.com/pollinations/pollinations/issues/10628#issuecomment-4365902427):

| Concern | Codex | Here |
|---|---|---|
| Language | JavaScript | TypeScript (matches the rest of `bees/`) |
| HTTP shape | Documented but no handler exists | Real `Request → Response` handler that mounts on Workers/Bun/Deno/Node |
| Auth | None | Requires `Bearer sk_*` developer key; rejects `pk_*` with a useful error |
| Status state | Always `"queued"` | State machine: `queued → building → ready` (or `→ failed`); illegal transitions throw |
| Update path | `PATCH` documented but not implemented | `PATCH /v1/bees/{id}` works; merges patch + re-deploys |
| Idempotency | Silently overwrites on duplicate name | `409 Conflict` unless `?upgrade=1` |
| Validation | Duplicates `validateManifest` | Reuses `bees/catgpt/manifest.ts:validateManifest` + `resolveManifest` |
| Placeholder client IDs | Pass validation | `pk_replace_me`, `pk_app_key`, etc. rejected at validate time with the link to enter.pollinations.ai |
| Billing meters | OK | OK + per-meter `note` strings the CLI can print directly |
| `requestedProvider` field | ✓ (good idea, kept) | Same — preserved through resolution |
| `bees:exec` scope | Not present | Container bees additionally need `bees:exec` to separate "deploy a container" from "let it run shell" |

Things I did **not** change because codex's choices are correct:

- `--dry-run` returning the full deployment shape (id, projected URLs, billing meters, scopes). This is the right UX; copying it.
- Per-runtime billing meters (workers don't get `runtime_compute`).
- `source: { type, ... }` with `git`/`template`/`bundle` discriminator.
- `routeForSurface(baseUrl, id, surface)` URL projection scheme.

## Layout

```
bees/deploy-api/
├── README.md                 ← this file
├── manifest-deploy.ts        ← extends AgentManifest with source/name/billing.clientId/env
├── manifest-deploy.test.ts   ← 16 tests
├── store.ts                  ← state-machine deployment store
├── store.test.ts             ← 13 tests
├── billing.ts                ← per-runtime meters + required scopes
├── billing.test.ts           ← 9 tests
├── routes.ts                 ← Request → Response HTTP handler
├── routes.test.ts            ← 14 tests
└── scripts/smoke.sh          ← unit tests + parse-check + structural check
```

## API

```
POST   /v1/bees                  → create (201 + Location)
POST   /v1/bees?upgrade=1        → create-or-update (200)
GET    /v1/bees                  → list
GET    /v1/bees/{id}             → get (decorated with billingEstimate + requiredScopes)
PATCH  /v1/bees/{id}             → update + re-deploy
DELETE /v1/bees/{id}             → soft-delete (204)
GET    /v1/bees/{id}/events      → events, oldest-first
GET    /v1/bees/{id}/events?since=ISO  → filtered
POST   /v1/bees/{id}/transitions → admin: drive the state machine
```

All requests require `Authorization: Bearer sk_*`. The `transitions` endpoint exists so a builder service can mark deployments `building`/`ready`/`failed` from outside; in production it would be private.

## State machine

```
queued ──→ building ──→ ready
   │           │           │
   │           ↓           ↓
   │        failed       failed
   │           │
   ↓           ↓
deleted    queued (retry)
```

`ready → building` is also allowed (re-deploy via PATCH).

## What's not here yet

- The CLI (`polli bees init`/`validate`/`deploy`/`status`/`update`/`events`/`delete`). That's the next iteration; lives under `bees/polli-cli/` (TBD).
- Persistence beyond a `Map`. The `DeployStore` interface is small enough that a KV/DO/Postgres backing is a drop-in replacement.
- The actual builder. `transitions` lets *something* drive deployments through the state machine; that something is out of scope for this reference.

## Running tests

```bash
bash bees/deploy-api/scripts/smoke.sh
```

No install needed — `node --experimental-strip-types --test`. If your Node is older than 22.6, upgrade.
