# Deployment

## Workflows

| Workflow | Target | Automatic trigger |
| --- | --- | --- |
| `deploy-applications.yml` | Repository applications | Relevant push to `production` |
| `deploy-enter-cloudflare.yml` | `enter.pollinations.ai` | Relevant push to `production` |
| `deploy-gen-cloudflare.yml` | `gen.pollinations.ai` | Relevant push to `production` |
| `deploy-media-cloudflare.yml` | `media.pollinations.ai` | Relevant push to `production` |
| `deploy-portkey-cloudflare.yml` | Portkey gateway | Relevant push to `production` |
| `deploy-website-cloudflare.yml` | `pollinations.ai` | Relevant push to `production` |

Application deployment is discovered from each app's `deploy.json`. All
applications deploy from `production`; `main` never deploys. Manual dispatch
accepts an application name or path and is also restricted to `production`.
