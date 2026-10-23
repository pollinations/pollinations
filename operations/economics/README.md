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

Live mode uses the shared admin-only Enter sign-in. Local development reads the staging Tinybird
workspace through `secrets/web.dev.json`; production reads the production
workspace through `secrets/web.json`. The credentials are exposed only to the
Worker, never to the browser bundle.

Production deploys through `.github/workflows/deploy-applications.yml`
on the `production` branch. The workflow deploys the Worker with both custom
domains and verifies both session endpoints.

The canonical Economics Tinybird datasource and pipe definitions
(`economics_*`) live in
[`enter.pollinations.ai/observability/`](../../enter.pollinations.ai/observability/).

The private [Vendor journals folder](https://drive.google.com/drive/folders/1GnyBRJEGtuZjdJl9qrBapH6jfUpmG9ei)
owns vendor definitions, accounts, access and collection details, and business
categories (`category`, `cashRules` and `runwayLine`). The dashboard reads and
validates its files after sign-in, once per page load, before running calculations.
There is no repository fallback. `operations/economics/provider-registry.json`
keeps canonical vendor IDs/aliases and exact historical model mappings only.
The two sources join on vendor ID; their vendor sets must match.
`web/src/lib/categories.ts` only defines the category
vocabulary; the vendor ledger `type` still maps `inference`/`gpu` to compute
and `infra` to infrastructure. A vendor registered as `uncategorized` has not
been reviewed yet and keeps its canonical supplied category until it is.

Trends uses the same sales and service-month costs as Runway. Its expense
curves use the existing ledger categories, at full cost before credits. Reviewed
`prior_period_fraud` classifications and evidence are attached to existing Stripe
transaction IDs. Sales derives earlier-month fraudulent refunds/disputes and
their dispute fees from those records. Actuals remain
unchanged; diamonds add back only those identified amounts. The Sales query retains the
native-currency breakdown and archived evidence for calculations. Missing review is not zero, and
incomplete coverage or a classification exceeding its Sales component prevents
an adjusted result.

Planning amounts belong in non-posting Vendor `type=planned` rows; they never
book actual spending or cash. Each vendor journal holds that vendor’s remaining
non-monetary rules and review notes alongside its definition. The app reads the
folder through the approved service-account connection. The old `economics_private_config` datasource
and endpoint were removed from staging after validating unchanged totals.
Vendor source statements store invoice/report totals as
non-posting facts (`type=statement`, `statement_amount`, zero paid/credit).
`compared_entry_ids` links the exact source records; `comparison_basis` selects
usage cost or signed funding/balance, and `comparison_month` identifies the
review period. The dashboard derives differences live, preserves unknowns for
missing links, and clears a difference when the linked figures agree. No saved
reconciliation issue or duplicate booked expense is needed.

Runway is derived mathematically from `economics_bank_ledger_api`,
`economics_vendor_ledger_api`,
checked balances, and the reviewed calculation rules in
`web/src/lib/forecastTerms.ts`. It has no separate Tinybird forecast or runway
ledger.

Each P&L category has one declared source (`pnlSource` in
`web/src/lib/categories.ts`). Compute and Infrastructure are ledger-based:
their actual columns come from the vendor ledger by service month, paid and
credit-funded usage both count as expense, and the bank payments that settle
those invoices stay in cash only. Cash adjustments explain the difference
between revenue and expenses and actual bank movements. A ledger category
never falls back to cash: a vendor with bank payments and no ledger rows is
shown as a warning line without an amount. Every other category is
bank-based. A reviewed `expense_month=YYYY-MM` annotation in a Bank row's
semicolon-delimited evidence assigns that expense to its service month without
changing the payment date, amount or USD valuation. Revenue and balance-sheet
movements ignore this annotation. Forecast columns remain cash projections.

Corrections in the bank and vendor ledgers are append-only: publishers reuse
the stable `entry_id` with a newer `recorded_at`. Vendor tombstones use the
explicit `source=tombstone` marker and remain preserved in the raw ledger while
the effective endpoint hides them.

The app and collection guides use `economics_vendor_ledger` and
`economics_vendor_ledger_api`. Staging has the verified full-history copy;
the unused `economics_compute_ledger` datasource and API were retired from
staging. Their definitions are removed so later deployments do not recreate them.
Follow the single [ledger consolidation migration](migrations/2026-10-ledger-consolidation.md)
for preparation, source comparisons, reader switching, cleanup and recovery.
Production execution remains separately approved.

### Stripe financial source (staging)

Sales and sales reconciliation query `economics_stripe_sales_api` live. It sums
`economics_stripe_transactions`, one row per Stripe account and balance transaction
ID. Enter's existing `stripe_event` supplies payment identity only; its amounts
are never added again. Historical payment-intent events and charge events both
resolve to the same charge ID.

`economics_stripe_sync` stores collection receipts (UTC coverage and source row
counts), not monthly sales or reconciliation results. Missing accounts, incomplete
exports, stale current-month coverage and unmatched Enter payments are derived
when queried. Payouts and currency conversions are not sales; their fees count
once. Refunds, disputes and reversals stay in their recorded month.

Refresh a complete UTC month, or the current month through now, with
`node operations/economics/ingest/stripe-sync.mjs pollen 2026-10-01 now --write`.
The command uses existing `STRIPE_API_KEY`, `TINYBIRD_PROD_READ_TOKEN` (Enter
read only) and `TINYBIRD_STRIPE_SYNC_TOKEN` (staging write) from the process
environment. It verifies both account and workspace before writing. Run one
collector at a time: refresh atomically replaces the deduplicated financial
source, preserving other months and accounts. A repeated import is idempotent.
Ko-fi uses its separate Stripe account; browser exports can be passed to the
same validated `sync` function without creating an API credential.

The old `economics_stripe_sales` rows were archived in the Finance Drive and
removed from staging after all 176 financial/count comparisons matched across
22 January–September rows. The empty staging datasource and its definition have also been removed;
`economics_stripe_sales_api` remains active on the transaction source. Production
still needs its separately approved migration before deploying this deletion.
October is partial.
This is a refresh command, not an installed automatic schedule; Ko-fi currently
requires its signed-in browser export. Production remains on its existing source
until separately deployed.

Ko-fi stopped accepting new payments on 16 October 2026 (operator confirmed).
Runway retains recorded October activity but stops recurring Ko-fi sales projections.
This does not certify the Stripe account's final fees, refunds or payouts: retain
financial collection coverage until its final settlement is verified.
