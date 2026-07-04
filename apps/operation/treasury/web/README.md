# Treasury Web

Treasury local UI over raw Forager Tinybird pipe outputs in the `operations`
workspace. Tabs: Recon, Invoices, Payments, Burn, Credits, Runs.

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
`coverage_ep`, `gaps_ep`, `invoices_ep`, `payments_ep`, `meter_monthly_ep`,
`usage_ep`, `grants_ep`, `runs_ep`.

Each tab shows one table and a short where/how/what/why note. Source labels use
the same vocabulary as the spend-audit PoC where useful: `TB`, `WS`, `ST`,
`API`, `IV`, `HC`, `UNV`, and `=`.

The UI must not add synthetic source columns. When Tinybird exposes a source
field for a value, such as `granted_src` for `granted_usd`, the source is shown
as a colored inline label inside that value cell.

The app does not compute verdicts in the browser. Anything that derives rows
lives in forager; edits append facts for the next ingest run to fold in.
