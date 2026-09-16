---
name: enter-services
description: "Deploy and manage the enter.pollinations.ai Cloudflare Worker (auth gateway + billing). Requires: sops, wrangler."
---

# Requirements

Before using this skill, ensure you have:
- **sops**: `brew install sops` (for decrypting secrets)
- **Wrangler**: `npm install -g wrangler`
- **Node.js**: `brew install node`

Must run from the `pollinations` repo root.

---

# Architecture Overview

| Environment | Gateway (Cloudflare Worker) | Generation |
|-------------|----------------------------|------------|
| **Production** | `enter.pollinations.ai` | `gen.pollinations.ai` Worker |
| **Staging** | `staging.enter.pollinations.ai` | `staging.gen.pollinations.ai` Worker |

The former `enter-services` / `enter-services-staging` EC2 boxes
(`text-pollinations.service`, `image-pollinations.service`) are decommissioned;
text and image generation run inside the `gen.pollinations.ai` Worker. The
Discord bots that lived on `enter-services` now run on the `monitoring-agents`
EC2 box — see `apps/discord-bot-family/README.md` and
`operations/infrastructure/gpu/GPU_INSTANCES.md`.

---

# Deploy Cloudflare Worker (enter.pollinations.ai)

Production deploys only through GitHub Actions (`Deploy / Cloudflare
production`, dispatched from the `production` branch) — never
`wrangler deploy --env production` from a local machine. See AGENTS.md
"Cloudflare Production Deployment Safety".

```bash
cd enter.pollinations.ai
npm run deploy:staging   # staging only
```

There is no staging GitHub Actions workflow: staging deploys are manual, per
service (`enter.pollinations.ai` and `gen.pollinations.ai` each have
`deploy:staging`). If the branch adds a D1 migration, apply it first with
`npm run migrate:staging` in `enter.pollinations.ai`. Set
`CLOUDFLARE_ACCOUNT_ID` explicitly for D1/wrangler commands; the local
wrangler login spans more than one account and can silently target the wrong
one.

`deploy:staging` does not sync secrets. A merged SOPS secret is not a deployed
secret: the production workflow pushes only some services' secrets, so check
each required name on its specific Worker (`wrangler secret list --env
staging`) and push missing ones with `npm run push-secrets:staging` for that
service. Re-applying already-approved, unchanged secrets is ordinary
reconciliation, not a rotation; a new or changed value needs the Secret
Mutation Safety approval in `AGENTS.md`. See [token-rotation.md](token-rotation.md).

## Testing on Staging

- Test token: `ENTER_API_TOKEN_STAGING` in `enter.pollinations.ai/.testingtokens`. It has gone dead before without the file being updated; if requests fail auth, re-mint before assuming the deploy is broken.
- Agents (code/script/prompt) are invoked by `owner/name` model id on staging, same as production.
- Cheap read-only pre-checks: pending migrations (`wrangler d1 migrations list DB --remote --env staging`), which secret names exist on the Worker (`wrangler secret list --env staging`), and the dispatch namespace list for dispatch-based features.

---

# Wrangler Configuration

The `wrangler.toml` contains environment configs:

| Environment | Route | Service URLs |
|-------------|-------|--------------|
| `production` | `enter.pollinations.ai` | `gen.pollinations.ai` |
| `staging` | `staging.enter.pollinations.ai` | `staging.gen.pollinations.ai` |
| `local` | `localhost:3000` | Local dev |

---

# Token Rotation

Internal trust-boundary tokens (`PLN_ENTER_TOKEN`, `PLN_GPU_TOKEN`, Tinybird
tokens, SOPS recipients): see [token-rotation.md](token-rotation.md) for the
inventory, rotation mechanisms, deploy path, and rollback.

---

# OAuth Client Integration Notes

Dated reference notes for building or debugging a third-party OAuth client
against enter's auth endpoints. Verify against current source before relying
on them.

- **Open WebUI (as of 2026-09):** 0.11.x only calls `grant_type=refresh_token`
  when its stored token is within 5 minutes of `expires_at`, never in reaction
  to a 401 from the model backend. A non-200 refresh deletes Open WebUI's own
  `oauth_session` row but not the user's Open WebUI session, so a failed
  refresh and a revoked API key look identical to the user (a 401 on the next
  model call). A self-healing refresh needs a short `expires_in` so the
  5-minute trigger fires, and the refresh endpoint must return 200 for every
  still-live account.
- **enter's `apikey` table:** in `shared/db/better-auth.ts` the Better Auth
  `apikey` table maps the owning user to the Drizzle field `referenceId`, not
  `userId`. Reading `row.userId` compiles in loosely-typed spots and fails at
  runtime with a misleading "Unauthorized or invalid session" from
  `createApiKey`. Run `tsc` on new files touching this table before the first
  live test.

---

# Notes

- **Production** deploys on push to `production` branch
- **Staging** deploys manually per service with `npm run deploy:staging`; there is no staging branch workflow
- Always test on staging before merging to production
- `enter.pollinations.ai` handles auth/billing; generation requests are served by the `gen.pollinations.ai` Worker
