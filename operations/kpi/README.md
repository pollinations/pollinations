# KPI Dashboard

Weekly KPIs for pollinations.ai — `kpi.pollinations.ai` (origin
`kpi.myceli.ai`), Worker `myceli-kpi` on the Myceli Cloudflare account.

Everything sits behind Basic auth: the Worker runs before any asset is served,
so the SPA shell is gated too. All Tinybird and GitHub reads go through the
Worker; no token reaches the browser.

## Data

| Source   | Metrics                                            |
| -------- | -------------------------------------------------- |
| Tinybird | WAU, usage, retention, churn, segments, health      |
| D1       | Registrations and D7 activations (via Tinybird)     |
| Stripe   | Pack purchases and revenue (via Tinybird)           |
| GitHub   | Stars, app submissions                              |

North star: weekly active paying customers.

## Run

```bash
npm ci --prefix ../.. && npm ci
npm run decrypt-vars          # TINYBIRD_READ_TOKEN → .dev.vars (needs the age key)
echo 'DASHBOARD_PASSWORD=dev' >> .dev.vars
npm run dev                   # http://127.0.0.1:3456
```

`DASHBOARD_PASSWORD` is not in `secrets/env.json` — set it locally as above and
log in with any username.

## Deploy

Through GitHub Actions only: `Deploy / Applications` runs on pushes to
`production` that touch `operations/**`, discovers this folder via `deploy.json`
and runs `npm run deploy` plus a `wrangler secret bulk` from `secrets/env.json`.
Use `workflow_dispatch` with `operations/kpi` to force a deploy.
