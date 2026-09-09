# Environment Configuration Matrix

Overview of which external services each environment connects to.

## Service Configuration by Environment

| Service | Local Dev | Staging | Production |
|---------|-----------|---------|------------|
| **D1 Database** | `development-pollinations-enter-db` | `staging-pollinations-enter-db` | `pollinations-enter-db` |
| **Stripe** | Sandbox | Sandbox | **Live** |
| **TinyBird** | `pollinations_enter_staging` | `pollinations_enter_staging` | `pollinations_enter` |

> Each worker writes to a different Tinybird workspace, selected purely by the `TINYBIRD_INGEST_TOKEN` baked into its sops-encrypted secrets file (`secrets/{dev,staging,prod}.vars.json`). The ingest URL is the same regional host for both workspaces. Local dev and staging both target the staging workspace; only the production worker writes to the prod workspace.

## Stripe Webhooks

| Environment | Mode | Webhook Endpoint |
|-------------|------|------------------|
| Local Dev | Sandbox | `localhost:3000` (via Stripe CLI) |
| Staging | Sandbox | `staging.enter.pollinations.ai/api/webhooks/stripe` |
| Production | Live | `enter.pollinations.ai/api/webhooks/stripe` |

## Notes

- **Tinybird**: Two workspaces in the same region. Prod traffic lands in `pollinations_enter`; staging + local-dev traffic lands in `pollinations_enter_staging`. The `environment` column is still populated on each row but is no longer used by pipes for filtering — token-scoped routing handles environment separation. Pipes and datasources must be deployed to **both** workspaces (manually for now — no CI auto-deploy).
- **Stripe Test Cards**: Use `4242 4242 4242 4242` for sandbox testing.

## Configuration Files

- **Environment variables**: `wrangler.toml` (per-environment `[env.*]` sections)
- **Secrets**: `secrets/*.vars.json` (encrypted with sops)
