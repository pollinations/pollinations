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

## Gift Request Limits

Gift checkout, receipt, and redemption use Cloudflare rate-limit bindings defined
in `wrangler.toml` for every environment, with separate namespace IDs to keep
their counters isolated. Checkout allows 5 requests per minute per hashed IP;
receipts allow 10 per minute per hashed IP; redemption allows 10 per minute per
signed-in user (previously 10 per 10 minutes). These are approximate,
per-Cloudflare-location abuse limits, not global financial controls. Single-use
redemption and balance updates remain atomic in D1.

Deploy the Worker with all three bindings before exercising gifts. The consolidated
`0064_pollen_gift_codes.sql` migration creates only the gift table; staging databases
that already applied an earlier version need schema reconciliation before rollout.

## Notes

- **Tinybird**: Two workspaces in the same region. Prod traffic lands in `pollinations_enter`; staging + local-dev traffic lands in `pollinations_enter_staging`. The `environment` column is still populated on each row but is no longer used by pipes for filtering — token-scoped routing handles environment separation. Pipes and datasources must be deployed to **both** workspaces (manually for now — no CI auto-deploy).
- **Stripe Test Cards**: Use `4242 4242 4242 4242` for sandbox testing.

## Configuration Files

- **Environment variables**: `wrangler.toml` (per-environment `[env.*]` sections)
- **Secrets**: `secrets/*.vars.json` (encrypted with sops)
