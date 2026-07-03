# Tinybird Operations Platform

Workspace: `operations` (GCP europe-west2, https://api.europe-west2.gcp.tinybird.co)

## Contract

Schemas are **sparse by design** (2026-07 diet): derived numbers (`amount_usd`,
`month` from dates, `delta_usd`, `net_eur`) are computed in pipes / read
queries, not stored. The EUR→USD rate lives in `overrides`
(scope=`config`, key=`fx_eur_usd`) — append a newer row to change it.

## Source Vocabulary

Everything below describes provider consumption observed from different places.
Keep these planes separate: reconciliation compares them, but source tables do
not mix them.

| Plane | Datasource | Pipe | Meaning |
|---|---|---|---|
| `usage` | `usage_monthly` | `usage_ep` | What **our platform** metered while serving requests: Tinybird generation events, Pollen-denominated. This is our own estimate, not money moved. |
| `meter` | `meter_monthly` | `meter_monthly_ep` | What the **provider** reports we consumed: dashboard/API/CLI/BigQuery. `source='manual'` means a human copied the provider dashboard. This is their measurement, still not money moved. |
| `invoice` | `invoices` | `invoices_ep` | What the provider formally billed. `amount` is the money claim; `credit_usd` is credits applied or consumed. This is document truth. |
| `payment` | `payments` | `payments_monthly_ep` | What actually left Wise. This is cash-out truth. |

Usage printed on an invoice belongs to the invoice plane, usually as
`invoices.credit_usd`, not `meter_monthly`. One real-world fact can appear on
multiple planes; comparison belongs in reconciliation or later calculation
layers.

## Other Tables

| Class | Datasource | Pipe | Meaning |
|---|---|---|---|
| Stock | `balances` | `balances_ep` | Append-only provider balance snapshots. The pipe shows the latest snapshot per provider. This is not monthly burn unless a later calculation chooses to derive a delta. |
| Derived stock view | `grants` | `grants_ep` | Pool-level view rewritten each run from `credits.json`, `overrides`, and live balances. Keep, but treat as derived. |
| Money-in | `revenue_monthly` | `revenue_ep` | Stripe revenue per month. `net_eur` is computed in the pipe. |
| Derived verdicts | `reconciliation` | `coverage_ep`, `gaps_ep` | Invoice/payment coverage and chase status. |
| Derived P&L | `provider_month` | `provider_month_ep` | Mixed burn-engine output. The spend-audit PoC consumes it (by design — PoC stays a pure pipe consumer). Deletable only if the PoC is ever re-derived from the raw pipes. |
| Corrections | `overrides` | none | Append-only operator truth. Latest row per `(scope,key,field)` wins. Scopes include `config`, `grants`, and `reconciliation`. |
| Ops | `ingest_runs` | `runs_ep` | Harvest job execution log. |

## Naming Laws

1. Pipes are never renamed in place. Add the new pipe, migrate consumers, then
   delete the old pipe with fresh approval. `cash_monthly_ep` ->
   `payments_monthly_ep` is the live example.
2. Manual facts live inside the fact table via `source='manual'`; do not create
   separate manual tables. Monthly manual credit burn is a `meter_monthly` row
   with `funding='credit'`. Manual remaining balance is a `balances` row. Grant
   corrections live in `overrides`.
3. `payments_ep` is reserved for a future transaction-grain Wise pipe using
   `wise_ref`. Do not build it until a consumer needs transaction grain.

## Pipes

| Pipe | Source | Status |
|---|---|---|
| `invoices_ep` | Deduped `invoices` with computed `amount_usd` | Keep |
| `usage_ep` | Raw `usage_monthly` rows | Keep |
| `meter_monthly_ep` | Raw `meter_monthly` rows | Keep (live since deployment #9) |
| `payments_monthly_ep` | Monthly aggregate over `payments` (ex `cash_monthly_ep`) | Keep (live since deployment #9) |
| `balances_ep` | Latest `balances` snapshot per provider | Keep |
| `grants_ep` | All `grants` rows ordered by pool | Keep |
| `revenue_ep` | `revenue_monthly` with computed `net_eur` | Keep |
| `coverage_ep` | All `reconciliation` rows | Keep |
| `gaps_ep` | Reconciliation chase list | Keep |
| `provider_month_ep` | Mixed `provider_month` rows | Keep while the spend-audit PoC consumes it; deletable only if the PoC is re-derived from raw pipes |
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
`invoices`, `payments`, `balances`, and derived tables. The canonical vocabulary
is the set of provider slugs defined in the pools of
`apps/operation/forager/secrets/credits.json`; `harvest.PROVIDERS` (email
classifier, also the slug→category map) and `wise.ALIAS` (Wise counterparty
matcher) must both emit exactly those slugs.

## Rules

- **Apps read pipes only** — never re-pull datasources directly.
- **Schemas change only via this folder** — run `tb --cloud deploy` from here. Datasource columns need `json:$.field` JSONPaths (Events API requires them).
- **Admin token** lives in local `.tinyb` only, never in SOPS.
- **Never truncate/recreate `invoices` or `overrides` without a FORWARD_QUERY** — operator truth (label rows, manual values) lives in them. Everything else is re-derivable.
