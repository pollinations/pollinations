# Treasury

Treasury is the raw operations viewer and editor for Forager data.

Forager harvests invoices, Wise payments, provider balances, usage, revenue, and
operator overrides into the Tinybird `operations` workspace. This app reads the
Forager endpoint pipes and appends operator facts back through Tinybird Events
API datasources. It does not compute reconciliation verdicts or analytics.

Run locally from the web package:

```bash
npm run dev
```

The dev server is pinned to `127.0.0.1:4180`.

Use fixtures mode for UI development without password or Tinybird access:

```text
http://127.0.0.1:4180/?fixtures=1
```

Live mode uses a password gate. Tinybird read/write tokens live only in
`secrets/web.json` and are used by the Vite server-side proxy, never by the
browser bundle. The read token is the pipe-scoped `treasury_web` token; writes
are limited again by the proxy datasource allowlist.

Data contracts live in `../forager/tinybird/README.md`. The implementation plan
for raw editing is `PLAN-RAW-EDIT.md`.
