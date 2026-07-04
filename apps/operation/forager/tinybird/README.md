# Tinybird Operations Platform

Workspace: `operations` (GCP europe-west2, https://api.europe-west2.gcp.tinybird.co)

## Contract

Schemas are **sparse by design** (2026-07 diet): derived numbers (`amount_usd`,
`delta_usd`, `net_eur`) are computed in the consuming app, not stored. Endpoint
pipes expose datasource columns for transparency; they should not hide source
fields behind aggregates. The EUR→USD rate lives in `overrides`
(scope=`config`, key=`fx_eur_usd`) — append a newer row to change it.

## Source Vocabulary

Everything below describes provider consumption observed from different places.
Keep these planes separate: reconciliation compares them, but source tables do
not mix them.

| Plane | Datasource | Pipe | Meaning |
|---|---|---|---|
| `usage` | `usage_monthly` | `usage_ep` | What **our platform** metered while serving requests: Tinybird generation events, Pollen-denominated. This is our own estimate, not money moved. |
| `meter` | `meter_monthly` | `meter_monthly_ep` | What the **provider** reports we consumed: dashboard/API/CLI/BigQuery. `source='manual'` means a human copied the provider dashboard. This is the monthly provider-cost backbone. Rows are keyed by provider/month/funding; the app displays credit usage and prepaid usage as separate columns. |
| `invoice` | `invoices` | `invoices_ep` | What the provider formally billed. `amount` is the money claim; `credit_usd` is credits applied or consumed. This is document truth. |
| `payment` | `payments` | `payments_ep` / `payments_monthly_ep` | What actually left Wise. This is cash-out truth. |

Usage printed on an invoice belongs to the invoice plane, usually as
`invoices.credit_usd`, not `meter_monthly`. One real-world fact can appear on
multiple planes; comparison belongs in reconciliation or later calculation
layers.

## Other Tables

| Class | Datasource | Pipe | Meaning |
|---|---|---|---|
| Money-in | `revenue_monthly` | `revenue_ep` | Stripe revenue per month. |
| Corrections | `overrides` | `overrides_ep` | Append-only operator truth. Latest row per `(scope,key,field)` wins. Scopes include `config` and payment rules. |
| Ops | `ingest_runs` | `runs_ep` | Harvest job execution log. |

The P&L burn engine (`provider_month` / `provider_month_ep`) and reconciliation
(`reconciliation` / `coverage_ep` / `gaps_ep`) were removed 2026-07-04. Crossing
the raw planes is now a simple minus in the consuming frontend (treasury app) and
the spend-audit PoC — see Naming Law 3. `usage_monthly` feeds only the Pollen
Usage tab and never the cost world.

## Naming Laws

1. Pipes are never renamed in place. Add the new pipe, migrate consumers, then
   delete the old pipe with fresh approval. `cash_monthly_ep` ->
   `payments_monthly_ep` is the live example.
2. Manual facts live inside the fact table via `source='manual'`; do not create
   separate manual tables. Monthly manual provider usage is a `meter_monthly`
   row with `funding='credit'` or `funding='prepaid'`.
3. Pipes are single-table reads (per-table transforms like dedupe, fx or
   month bucketing are fine). Crossing tables happens in the consuming
   frontend, not in pipes; promote a crossed view to a pipe only when it is
   stable AND shared by multiple consumers. (`credits_monthly_ep` was built
   crossed, then deleted for this reason, 2026-07-03.)

## Pipes

| Pipe | Source | Status |
|---|---|---|
| `invoices_ep` | Latest validated invoice row per SHA from `invoices`; review state lives in local folders | Keep |
| `usage_ep` | Raw `usage_monthly` rows | Keep |
| `meter_monthly_ep` | Raw `meter_monthly` rows | Keep (live since deployment #9) |
| `payments_monthly_ep` | Raw `payments` transactions plus month bucket (ex `cash_monthly_ep`) | Keep (live since deployment #9) |
| `payments_ep` | Raw `payments` transactions — home of counterparty rule edits | Keep (live since deployment #11) |
| `balances_ep` | Raw provider balance snapshots | Removed 2026-07-04 (provider balance snapshots deleted; provider usage is monthly source of truth) |
| `grants_ep` | Derived pool-level grants view | Removed 2026-07-04 (remaining values will be computed later from provider usage/config) |
| `overrides_ep` | Raw `overrides` rows | Keep |
| `revenue_ep` | Raw `revenue_monthly` rows | Keep |
| `coverage_ep` | All `reconciliation` rows | Removed 2026-07-04 (burn engine dropped; reconciliation is now a client-side minus in the treasury app) |
| `gaps_ep` | Reconciliation chase list | Removed 2026-07-04 (see `coverage_ep`) |
| `provider_month_ep` | Mixed `provider_month` rows | Removed 2026-07-04 (burn engine dropped; spend-audit PoC re-derives from `invoices_ep` + `meter_monthly_ep`) |
| `runs_ep` | Latest ingest runs | Keep |

## Tokens

`operations` is a Tinybird **Forward** workspace: resource-scoped tokens are declared in the datafiles here and managed by deployments; datafile tokens cannot carry `DATASOURCES:CREATE`.

| Token | Managed by | Scopes | SOPS key (`apps/operation/forager/secrets/env.json`) |
|---|---|---|---|
| `treasury_ingest` | datafiles | APPEND+READ on operations datasources | `TINYBIRD_OPS_INGEST_TOKEN` |
| `treasury_web` | datafiles | PIPES:READ on endpoint pipes declared here | `TINYBIRD_OPS_READ_TOKEN` |
| `treasury_replace` | API (static) | `DATASOURCES:CREATE` only | `TINYBIRD_OPS_REPLACE_TOKEN` |
| `treasury_append` | API (static, **not yet minted**) | APPEND on `overrides` + `invoices` only — the future UI write path | — |

`tb.replace()` (mode=replace) requires CREATE scope → always use `treasury_replace`. Appends and `/v0/sql` reads use `treasury_ingest`.

## Provider slug vocabulary

The `provider` column is the join key across `usage_monthly`, `meter_monthly`,
`invoices`, and `payments`. The canonical vocabulary is defined by the provider
alias config; invoice and payment classifiers must emit exactly those slugs.

## Rules

- **Apps read pipes only** — never re-pull datasources directly.
- **Schemas change only via this folder** — run `tb --cloud deploy` from here. Datasource columns need `json:$.field` JSONPaths (Events API requires them).
- **Admin token** lives in local `.tinyb` only, never in SOPS.
- **Never truncate/recreate `invoices` or `overrides` without a FORWARD_QUERY** — operator truth (manual rows and override values) lives in them. Everything else is re-derivable.
