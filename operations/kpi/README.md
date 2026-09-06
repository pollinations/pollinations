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
VITE_ENTER_URL=http://127.0.0.1:3000 npm run dev  # http://127.0.0.1:3456
```

Run Enter locally on port 3000. The static frontend uses Enter's existing Better
Auth session. Private reads go to `/api/dashboards/kpi/*` on Enter and require
an admin account. Enter uses its existing Tinybird reader and GitHub App;
no dashboard password, OAuth client or session secret is needed.

## Deploy

Through GitHub Actions only: `Deploy / Applications` runs on pushes to
`production` that touch `operations/**`, discovers this folder via `deploy.json`
and runs `npm run deploy` without synchronizing dashboard secrets.
Deploy the Enter data routes before the frontend.
Use `workflow_dispatch` with `operations/kpi` to force a deploy.
