# Economics Web

Economics UI for `economics.pollinations.ai`, backed
by OP Tinybird pipe outputs in `enter.pollinations.ai/observability/`.
The app has three operating views:

- **Insights:** Runway, Close, and Balances.
- **Unit economics:** Vendors, Inference, GPUs, and Community.
- **Ledgers:** Bank, Compute & Infra, and Pollen.

## Run

```bash
npm install
VITE_ENTER_URL=http://127.0.0.1:3000 npm run dev
```

The dev server is pinned to `http://127.0.0.1:4180`.

Run Enter locally on port 3000 as well. The dashboard uses Enter's existing
Better Auth session, just like account settings. No dashboard secrets or
separate session are needed. Production defaults to `https://enter.pollinations.ai`.

Private reads go to `/api/dashboards/economics/pipes/:pipe` on Enter, which
requires an admin session and uses `TINYBIRD_ECONOMICS_READ_TOKEN` server-side.
That dedicated read token must be provisioned in Enter before rollout, with
separate approval. Deploy Enter before this static frontend.

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

The frontend and its demo fixtures are public static assets. Real ledger data,
forecast assumptions and reconciliation explanations are loaded only through
Enter's protected read endpoints. GitHub Actions deploys the frontend without
synchronizing any dashboard secrets.

Runway reconstructs cash from one statement-backed opening-balance row in
`economics_bank_ledger` plus later bank movements. Closed months are actuals. The
open month shows actual cash to date beside the explicit full-month OP Forecast
plan; month-end cash applies only the unspent/unreceived remainder of that plan.
Future months use explicit forecast facts with structured methods (`fixed`,
`funded`, `last`, or `one_off`). Current Wise balance snapshots are verification
only and are not stored as a second balance ledger.
