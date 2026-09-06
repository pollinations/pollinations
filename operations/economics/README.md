# Economics

Economics is Pollinations' private cash, runway, provider-cost, credit, and unit
economics app. Its Myceli origin is `economics.myceli.ai`, and it is also
available at `economics.pollinations.ai` through the same Cloudflare Worker.

Run locally from this directory:

```bash
npm run dev
```

The dev server is pinned to `127.0.0.1:4180`.

Use fixtures mode for UI development without password or Tinybird access:

```text
http://127.0.0.1:4180/?fixtures=1
```

Live mode uses a password gate. Local development reads the staging Tinybird
workspace through `secrets/web.dev.json`; production reads the production
workspace through `secrets/web.json`. The credentials are exposed only to the
Worker, never to the browser bundle.

Production deploys through `.github/workflows/deploy-applications.yml`
on the `production` branch. The workflow deploys the Worker with both custom
domains and verifies both session endpoints.

The canonical Economics Tinybird datasource and pipe definitions
(`economics_*`) live in
[`enter.pollinations.ai/observability/`](../../enter.pollinations.ai/observability/).

`operations/economics/provider-registry.json` is the single vendor list. Every
counterparty that appears in the bank ledger, the compute ledger, or a Runway
line is registered there with its identity (aliases, accounts, connector) and
its business category (`category`, plus `cashRules` for vendors whose bank
description decides between purposes, and `runwayLine` for merchants folded
into one Runway line). `web/src/lib/categories.ts` only defines the category
vocabulary; the compute ledger `type` still maps `inference`/`gpu` to compute
and `infra` to infrastructure. A vendor registered as `uncategorized` has not
been reviewed yet and keeps its canonical supplied category until it is.

Runway is derived mathematically from `economics_bank_ledger_api`,
`economics_compute_ledger_api`,
checked balances, and the reviewed calculation rules in
`web/src/lib/forecastTerms.ts`. It has no separate Tinybird forecast or runway
ledger.

Corrections in the bank and compute ledgers are append-only: publishers reuse
the stable `entry_id` with a newer `recorded_at`. Compute tombstones use the
explicit `source=tombstone` marker and remain preserved in the raw ledger while
the effective endpoint hides them.
