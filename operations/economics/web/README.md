# Economics Web

Economics UI for `economics.myceli.ai` and `economics.pollinations.ai`, backed
by OP Tinybird pipe outputs in `enter.pollinations.ai/observability/`.
Insights include cash P&L, cash runway, credit runway, and unit economics. Raw
tabs: Data Quality, Transactions, Pollen, and Cloud.

## Run

```bash
npm install
npm run dev
```

The dev server is pinned to `http://127.0.0.1:4180`.

Auth uses a password gate backed by the Cloudflare Worker. For local development,
the shared password and the staging-only Tinybird reader are assembled from
`../secrets/web.json` and `../secrets/web.dev.json` into the ignored `.dev.vars`
file. Production deployment continues to use `../secrets/web.json`. No secret is
bundled or stored in the browser.

## Fixtures Mode

`http://127.0.0.1:4180/?fixtures=1` renders bundled sample data with no password
and no network calls.

## Data Contract

Reads OP pipes from `enter.pollinations.ai/observability/endpoints/`:
`op_transactions_api`, `op_cloud_api`, `op_pollen_api`, and `op_forecast_api`.
Write-side conventions (entry_id, idempotent corrections) live in the
Economics ingest agent's own system prompt.

The app is a read-only mirror; all reads go through the Worker proxy.
Production deployment stops before changing the Worker unless all four required
pipes already respond from the production Tinybird workspace. Deploy and verify
Tinybird schema changes before promoting a Worker that reads them.

Runway reconstructs cash from one statement-backed opening-balance row in
`op_transactions` plus later bank movements. Closed months are actuals. The
open month shows actual cash to date beside the explicit full-month OP Forecast
plan; month-end cash applies only the unspent/unreceived remainder of that plan.
Future months use explicit forecast facts with structured methods (`fixed`,
`funded`, `last`, or `one_off`). Current Wise balance snapshots are verification
only and are not stored as a second balance ledger.
