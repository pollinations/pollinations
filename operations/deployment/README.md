# Deployment

## Workflows

| Workflow | Target | Automatic trigger |
| --- | --- | --- |
| `deploy-applications.yml` | Repository applications | Relevant push to `production` |
| `deploy-cloudflare-production.yml` | `enter`, `gen` and `media.pollinations.ai` | Relevant push to `production` |
| `deploy-portkey-cloudflare.yml` | Portkey gateway | Relevant push to `production` |
| `deploy-website-cloudflare.yml` | `pollinations.ai` | Relevant push to `production` |

`deploy-cloudflare-production.yml` applies the shared D1 migrations once, then
deploys the three workers in parallel. Its `service` dispatch input targets a
single worker.

Application deployment is discovered from each app's `deploy.json`. All
applications deploy from `production`; `main` never deploys. Manual dispatch
accepts an application name or path and is also restricted to `production`.
