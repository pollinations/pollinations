# Treasury Web

Treasury local UI over raw Forager Tinybird pipe outputs in the `operations`
workspace. Tabs: Transactions, Pollen, Provider, and Revenue.

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
`transactions_api`, `provider_monthly_api`, `pollen_monthly_api`, `ingest_runs_api`, and
`revenue_monthly_api`.

The app is a read-only mirror; all reads go through the local server
proxy.
