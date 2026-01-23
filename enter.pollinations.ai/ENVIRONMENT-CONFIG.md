# Environment Configuration Matrix

Overview of which external services each environment connects to.

## Service Configuration by Environment

| Service | Local Dev | Staging | Production |
|---------|-----------|---------|------------|
| **D1 Database** | `development-pollinations-enter-db` | `staging-pollinations-enter-db` | `pollinations-enter-db` |
| **Stripe** | Sandbox | Sandbox | **Live** |
| **Polar** | Sandbox | **Production** ⚠️ | Production |
| **TinyBird** | Production* | Production* | Production |

> *TinyBird uses a single production workspace for all environments. Events include an `environment` column to distinguish source.

## Stripe Webhooks

| Environment | Mode | Webhook Endpoint |
|-------------|------|------------------|
| Local Dev | Sandbox | `localhost:3000` (via Stripe CLI) |
| Staging | Sandbox | `staging.enter.pollinations.ai/api/webhooks/stripe` |
| Production | Live | `enter.pollinations.ai/api/webhooks/stripe` |

## Notes

- **Polar on Staging**: Currently uses production Polar. Since Polar is being phased out, this avoids additional setup complexity.
- **TinyBird**: All environments log to the same TinyBird workspace (`pollinations_enter`). Use `livemode` column (for Stripe) or `environment` column to filter.
- **Stripe Test Cards**: Use `4242 4242 4242 4242` for sandbox testing.

## Configuration Files

- **Environment variables**: `wrangler.toml` (per-environment `[env.*]` sections)
- **Secrets**: `secrets/*.vars.json` (encrypted with sops)
