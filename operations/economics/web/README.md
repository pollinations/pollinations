# Economics Web

Economics UI for `economics.myceli.ai` and `economics.pollinations.ai`, backed
by OP Tinybird pipe outputs in `enter.pollinations.ai/observability/`.
The app has three operating views:

- **Insights:** Runway, Close, and Balances.
- **Unit economics:** Vendors, Inference, GPUs, and Community.
- **Ledgers:** Bank, Compute & Infra, and Pollen.

## Run

```bash
npm install
npm run dev
```

The dev server is pinned to `http://127.0.0.1:4180`.

Auth uses identity-only Pollinations OAuth backed by the Cloudflare Worker.
Enter checks administrator permission through Better Auth at token exchange;
the dashboard receives a profile, not a role claim or generation key. Its signed
HttpOnly session expires after 12 hours and signs out independently of Enter.

`npm run decrypt-vars` writes `.dev.vars` with the staging-only Tinybird reader
from `../secrets/web.dev.json` and a locally generated
`POLLINATIONS_AUTH_SESSION_SECRET` (reused across runs so you stay signed in).
The production session secret is provisioned separately through the approved
secret workflow. Login goes through Enter, so the local callback
(`http://127.0.0.1:4180/auth/callback`) must be registered on the Economics
`pk_` client, or set `POLLINATIONS_AUTH_BASE_URL` to a local Enter. Fixtures
remain available without credentials.

## Fixtures Mode

`http://127.0.0.1:4180/?fixtures=1` renders bundled sample data with no login
and no network calls.

## Data Contract

Reads OP pipes from `enter.pollinations.ai/observability/endpoints/`:
`economics_bank_ledger_api`, `economics_compute_ledger_api`, and the environment-routed
`economics_pollen_usage_api`. Production reads the live materialization; local
development reads the verified production snapshot in staging.
Write-side conventions (entry_id, idempotent corrections) live in the
Economics ingest agent's own system prompt.

The app is a read-only mirror; all reads go through the Worker proxy. In
deployed environments the Worker authenticates every request before serving
the SPA shell or any static asset, so private forecast assumptions and
reconciliation explanations cannot be downloaded before login. Localhost keeps
direct asset access for development and fixture mode. The public workers.dev
origin is disabled; only the two configured custom domains serve the app.
Production deployment stops before changing the Worker unless all four required
pipes already respond from the production Tinybird workspace. Deploy and verify
Tinybird schema changes before promoting a Worker that reads them.

Runway reconstructs cash from one statement-backed opening-balance row in
`economics_bank_ledger` plus later bank movements. Closed months are actuals. The
open month shows actual cash to date beside the explicit full-month OP Forecast
plan; month-end cash applies only the unspent/unreceived remainder of that plan.
Future months use explicit forecast facts with structured methods (`fixed`,
`funded`, `last`, or `one_off`). Current Wise balance snapshots are verification
only and are not stored as a second balance ledger.
