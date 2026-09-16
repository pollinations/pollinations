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

There is no staging workflow in GitHub Actions. Deploy staging by hand, per
service (`enter.pollinations.ai` and `gen.pollinations.ai` each have
`deploy:staging`). If the branch adds a D1 migration, run
`npm run migrate:staging` in `enter.pollinations.ai` first. Set
`CLOUDFLARE_ACCOUNT_ID` explicitly — the local wrangler login covers more than
one account and can pick the wrong one.

`deploy:staging` does not push secrets. Merging a SOPS change only updates the
file: check the Worker has each secret it needs (`wrangler secret list --env
staging`) and push missing ones with `npm run push-secrets:staging`. Re-pushing
an unchanged, already-approved secret is not a rotation; a new or changed value
needs Secret Mutation Safety approval (`AGENTS.md`). Details:
[token-rotation.md](token-rotation.md).

## Testing on Staging

- Test token: `ENTER_API_TOKEN_STAGING` in `enter.pollinations.ai/.testingtokens`. It has expired before without the file changing — if auth fails, re-mint before blaming the deploy.
- Agents are called by `owner/name` model id on staging, same as production.
- Cheap read-only checks: `wrangler d1 migrations list DB --remote --env staging`, `wrangler secret list --env staging`, and the dispatch namespace list.

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

# OAuth Client Notes

Dated notes from building third-party OAuth clients against enter. Check
current source before relying on them.

- **Open WebUI 0.11.x (2026-09):** refreshes its token only within 5 minutes
  of `expires_at`, never in response to a 401 from a model call. A failed
  refresh deletes its `oauth_session` row but keeps the user logged in, so a
  failed refresh and a revoked API key look the same to the user (401 on the
  next model call). For self-healing: issue a short `expires_in` so the
  refresh fires, and return 200 from the refresh endpoint for every live
  account.
- **`apikey` table:** in `shared/db/better-auth.ts` the owner field is
  `referenceId`, not `userId`. `row.userId` compiles in loosely typed code and
  fails at runtime with a misleading "Unauthorized or invalid session" from
  `createApiKey`. Run `tsc` on new files touching this table before testing
  live.

---

# Notes

- **Production** deploys on push to `production` branch
- **Staging** deploys manually per service with `npm run deploy:staging`; there is no staging branch workflow
- Always test on staging before merging to production
- `enter.pollinations.ai` handles auth/billing; generation requests are served by the `gen.pollinations.ai` Worker
