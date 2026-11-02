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

Legacy Chat and React addresses use native Cloudflare Redirect Rules in the
`pollinations.ai` and `myceli.ai` zones:

- `chat.pollinations.ai` and `chat.myceli.ai` → `https://openwebui.pollinations.ai/`
- `react.pollinations.ai` and `react.myceli.ai` → `https://github.com/pollinations/pollinations/tree/main/packages/ui`

These rules return HTTP 301, discard the old path and preserve query strings.
The four DNS records are proxied A records pointing to `192.0.2.1`; no Pages
project or repository deployment manifest is needed.

Health checks expect HTTP 200 by default. Redirect-only apps set `verify_redirect`
to their destination URL; every checked URL must return HTTP 301 with that exact
destination before deployment succeeds.
