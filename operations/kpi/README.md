# KPI Dashboard

Weekly KPIs for pollinations.ai — `kpi.pollinations.ai` (origin
`kpi.myceli.ai`), Worker `myceli-kpi` on the Myceli Cloudflare account.

The public app shell shows “Sign in with Pollinations.” The app uses OAuth
with PKCE to check identity and admin access, then creates its own signed,
HttpOnly session cookie. All Tinybird and GitHub reads require that app session;
no provider token reaches the browser. This identity login does not grant
access to Pollen balances or generation keys.

“Sign out” clears only KPI's session. Enter and other apps stay signed in.
Sessions expire after 12 hours; admin status is checked at sign-in, so a role
change takes effect on the next sign-in or when the existing session expires.

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
npm run dev  # http://localhost:3457
```

Run Enter locally on port 3000. Set `POLLINATIONS_AUTH_BASE_URL` to
`http://localhost:3000` in the ignored `.dev.vars` file and register
`http://localhost:3457/auth/callback` on the local KPI OAuth client.
The production callback registration stays HTTPS-only.

The Worker needs its own `POLLINATIONS_AUTH_SESSION_SECRET` (at least 32
characters), a staging-only `TINYBIRD_READ_TOKEN`, and GitHub App credentials
for GitHub metrics. Adding or copying credentials requires separate approval
under the repository's secret rules. Never reuse Enter's session signing secret.
Private reads use same-origin `/api/kpi/*`; cookies are separated by port locally.

## Deploy

Through GitHub Actions only: `Deploy / Applications` runs on pushes to
`production` that touch `operations/**`, discovers this folder via `deploy.json`
and runs `npm run deploy`. The Cloudflare Vite plugin builds both the app and
its Worker. Deploy Enter's KPI OAuth client registration before the KPI Worker.
Provision the app's signing secret and data-reader credentials separately,
with explicit approval, before rollout. The deployment does not synchronize them.
Use `workflow_dispatch` with `operations/kpi` to force a deploy.
