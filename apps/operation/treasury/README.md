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

Use fixtures mode for UI development without Tinybird tokens:

```text
http://127.0.0.1:4180/?fixtures=1
```

Live mode uses a paste-once token gate stored in browser localStorage. Read and
append tokens must never be bundled into the app or committed to git.

Data contracts live in `../forager/tinybird/README.md`. The implementation plan
for raw editing is `PLAN-RAW-EDIT.md`.
