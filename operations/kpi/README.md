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
npm run decrypt-vars          # TINYBIRD_READ_TOKEN → .dev.vars (needs the age key)
echo "POLLINATIONS_AUTH_SESSION_SECRET=$(openssl rand -hex 32)" >> .dev.vars
npm run dev                   # http://127.0.0.1:3456
```

The session secret only signs this Worker's local cookie; any 32+ character
value works. Login still goes through Enter, so the local callback
(`http://127.0.0.1:3456/auth/callback`) must be registered on the KPI `pk_`
client, or point `POLLINATIONS_AUTH_BASE_URL` at a local Enter.

Enter checks administrator permission through Better Auth at token exchange,
including its configured admin users. The app receives profile data and creates
its own 12-hour HttpOnly session, not an API key or role claim. Sign-out affects
this dashboard only. Session-secret provisioning remains a separate,
approval-gated prerequisite before deployment.

## Deploy

Through GitHub Actions only: `Deploy / Applications` runs on pushes to
`production` that touch `operations/**`, discovers this folder via `deploy.json`
and runs `npm run deploy` plus a `wrangler secret bulk` from `secrets/env.json`.
Use `workflow_dispatch` with `operations/kpi` to force a deploy.
