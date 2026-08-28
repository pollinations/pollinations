# KPI Dashboard

Weekly KPIs for pollinations.ai — `kpi.pollinations.ai` (origin
`kpi.myceli.ai`), Worker `myceli-kpi` on the Myceli Cloudflare account.

Everything sits behind Pollinations OAuth: the Worker runs before any asset is
served, so the SPA shell is gated too. All Tinybird and GitHub reads go through
the Worker; no provider token reaches the browser.

## Data

| Source   | Metrics                                            |
| -------- | -------------------------------------------------- |
| Tinybird | WAU, usage, retention, segments, health      |
| D1       | Registrations and D7 activations (via Tinybird)     |
| Stripe   | Pack purchases and revenue (via Tinybird)           |
| GitHub   | Stars, app submissions                              |

North star: weekly active paying customers.

## Run

```bash
npm ci --prefix ../.. && npm ci
npm run decrypt-vars          # Worker configuration → .dev.vars (needs the age key)
npm run dev                   # http://127.0.0.1:3456
```

`POLLINATIONS_AUTH_ALLOWED_EMAILS` is a comma-separated, case-insensitive email
allowlist shared by the three internal apps. An empty allowlist denies everyone.

## Deploy

Through GitHub Actions only: `Deploy / Applications` runs on pushes to
`production` that touch `operations/**`, discovers this folder via `deploy.json`
and runs `npm run deploy` plus a `wrangler secret bulk` from `secrets/env.json`.
Use `workflow_dispatch` with `operations/kpi` to force a deploy.
