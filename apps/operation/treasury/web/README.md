# Treasury Web

Treasury local UI over raw Forager Tinybird pipe outputs in the `operations`
workspace. Tabs: Invoices, Payments, Pollen Usage, Provider Usage, Revenue, and
Ingest Log.

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

Reads exactly these pipes from `apps/operation/forager/tinybird/pipes/`:
`invoices_ep`, `payments_ep`, `meter_monthly_ep`, `usage_ep`, `runs_ep`, and
`revenue_ep`.

Each tab shows one table and a short where/how/what/why note. Provider Usage is
the manual/provider-dashboard table for monthly credit and prepaid usage.

Provider Usage stores one source label per monthly usage value: `manual` when an
operator entered it, or the connector name/source when forager fetched it. Edits
append facts for the next ingest run to fold in.
