# Economics Web

Economics UI for `economics.pollinations.ai`, backed by OP Tinybird pipe outputs
in `enter.pollinations.ai/observability/`, deployed to the `pollinations_enter`
(prod) workspace.
Insights include cash P&L, cash runway, credit runway, and unit economics. Raw
tabs: Data Quality, Transactions, Pollen, and Cloud.

## Run

```bash
npm install
npm run dev
```

The dev server is pinned to `http://127.0.0.1:4180`.

Auth uses a password gate backed by the Vite server. Tinybird read/write tokens
are decrypted from `../secrets/web.json` on the server and are never bundled or
stored in the browser. The read token is pipe-scoped; write calls go through the
server allowlist for the current editor datasources.

## Fixtures Mode

`http://127.0.0.1:4180/?fixtures=1` renders bundled sample data with no password
and no network calls.

## Data Contract

Reads OP pipes from `enter.pollinations.ai/observability/endpoints/`:
`op_transactions_api`, `op_cloud_api`, `op_pollen_api`, and `op_runway_api`.
Write-side conventions (entry_id, idempotent corrections) live in the
Economics ingest agent's own system prompt.

The app is a read-only mirror; all reads go through the local server
proxy.

Runway keeps the open month as two independent columns: Current Wise cash and
the agent-authored full-month Forecast. Closed months are actuals; future months
are explicit forecast facts. Forecast methods (`last` or `zero`) are
materialized by the Economics ingest agent and never evaluated in the browser.
