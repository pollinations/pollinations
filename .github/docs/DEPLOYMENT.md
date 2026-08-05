# Deployment

## Workflows

| Workflow | Target | Automatic trigger |
| --- | --- | --- |
| `apps-deploy-changed.yml` | Changed community apps | Relevant push to `main` |
| `deploy-enter-cloudflare.yml` | `enter.pollinations.ai` | Relevant push to `production` |
| `deploy-gen-cloudflare.yml` | `gen.pollinations.ai` | Relevant push to `production` |
| `deploy-media-cloudflare.yml` | `media.pollinations.ai` | Relevant push to `production` |
| `deploy-operations-cloudflare.yml` | Operations apps | Relevant push to `production` |
| `deploy-polli-vps.yml.disabled` | Polli Discord bot | Disabled — pending new VM provisioning |
| `deploy-portkey-cloudflare.yml` | Portkey gateway | Relevant push to `production` |
| `deploy-website-cloudflare.yml` | `pollinations.ai` | Relevant push to `production` |

The seven active workflows also support manual dispatch. Re-enable the Polli
deploy by dropping the `.disabled` suffix once the VM and its secrets exist.
