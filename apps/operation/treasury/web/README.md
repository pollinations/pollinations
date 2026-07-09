# Treasury Web

Treasury local UI over OP Tinybird pipe outputs in the `operations` workspace.
Raw tabs: Data Quality, Transactions, Pollen, and Cloud.

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

Reads OP pipes from `apps/operation/treasury/tinybird/pipes/`:
`op_transactions_api`, `op_cloud_api`, and `op_pollen_api`.

It also reads `ingest_runs_api` for freshness status while that operational
status pipe remains available.

The app is a read-only mirror; all reads go through the local server
proxy.
