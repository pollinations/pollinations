# Tinybird Operations Platform

Workspace: `operations` (GCP europe-west2, https://api.europe-west2.gcp.tinybird.co)

## Contract

Schemas are **sparse by design** (2026-07 diet): derived numbers (`amount_usd`,
`month` from dates, `delta_usd`, `net_eur`) are computed in pipes / read
queries, not stored. The EUR→USD rate lives in `overrides`
(scope=`config`, key=`fx_eur_usd`) — append a newer row to change it.

**Datasources** (read-only grain for apps):

| Datasource | Grain | Purpose |
|---|---|---|
| `invoices` | provider, period_month, issued_at | Harvested invoices with `category` (compute/infra/saas/admin/office/payroll/other) + `kind`; append-only, corrections are `source='label'` rows; `ingested_at` is a DateTime so dedupe is deterministic |
| `payments` | provider, paid_at | Wise outflows per transaction (EUR); `category` stamped from the harvest classifier, `unmatched` when no provider matched |
| `reconciliation` | month, provider | Invoice vs. payment verdicts per provider × month (full-replace) |
| `ingest_runs` | run_at | Harvest job execution log; ok/statuses/notes |
| `balances` | provider, run_at | Append-only live balance snapshots per provider (granted/spent/left/prepaid); latest-wins on read via balances_ep |
| `meter_monthly` | provider, month, retrieved_at | Append-only provider meter reads (cost, funding, source); diagnostic only, not P&L |
| `usage_monthly` | month, provider, model | Full-replace usage by model and month; paid/quest Pollen requests, cost, and billable value split at ingest; provider slugs canonicalized at ingest (bedrock→aws, azure-2→azure, vastai→vast.ai) |
| `revenue_monthly` | month | Full-replace Stripe revenue per month (gross/fees/refunds EUR; net computed in pipe) |
| `provider_month` | provider, month, **category** | Full-replace burn-engine output. Invoice sums keyed by invoice category; burn signals (meter/usage/credit/status) sit on the provider's default-category row. `WHERE category='compute'` = the compute P&L |
| `grants` | pool | Pool-level grant view with `category` (from the pool's providers); rewritten each run |
| `overrides` | scope, key, field, entered_at | **Append-only operator truth.** Latest row per (scope,key,field) wins. Scopes: `config` (fx_eur_usd), `grants` (granted_usd/left_usd/prepaid_left_usd per pool, beats credits.json hc, beaten by live API), `reconciliation` (field=`accepted` per `YYYY-MM:provider`) |

**Pipes** (read-only endpoints for UI):

| Pipe | Query | Audience |
|---|---|---|
| `invoices_ep` | **Deduped** invoices (best row per sha256: label > final decision > latest) with computed `amount_usd` | Dashboard, audit |
| `gaps_ep` | Reconciliation rows with status in (missing_invoice, amount_mismatch, needs_review); `delta_usd` computed | Chase list |
| `coverage_ep` | All reconciliation rows | Grid view |
| `balances_ep` | Latest balance snapshot per provider (argMax over run_at) | Balances tab |
| `grants_ep` | All grant pool rows ordered by pool | Grants tab |
| `usage_ep` | All usage_monthly rows | Treasury Burn tab |
| `cash_monthly_ep` | Wise payments by month × provider × category (`(unmatched)` bucket included); `paid_usd` computed via fx override | Cash tab |
| `revenue_ep` | Revenue per month; `net_eur` computed | Revenue tab |
| `provider_month_ep` | Joined provider × month × category table | Compute P&L (filter `category='compute'`) |
| `runs_ep` | Latest 50 ingest runs | Run log |

## Tokens

`operations` is a Tinybird **Forward** workspace: resource-scoped tokens are declared in the datafiles here and managed by deployments; datafile tokens cannot carry `DATASOURCES:CREATE`.

| Token | Managed by | Scopes | SOPS key (`apps/operation/forager/secrets/env.json`) |
|---|---|---|---|
| `treasury_ingest` | datafiles | APPEND+READ on all 11 datasources | `TINYBIRD_OPS_INGEST_TOKEN` |
| `treasury_web` | datafiles | PIPES:READ on the 10 endpoint pipes | `TINYBIRD_OPS_READ_TOKEN` |
| `treasury_replace` | API (static) | `DATASOURCES:CREATE` only | `TINYBIRD_OPS_REPLACE_TOKEN` |
| `treasury_append` | API (static, **not yet minted**) | APPEND on `overrides` + `invoices` only — the future UI write path | — |

`tb.replace()` (mode=replace) requires CREATE scope → always use `treasury_replace`. Appends and `/v0/sql` reads use `treasury_ingest`.

## Provider slug vocabulary

The `provider` column is the join key across `invoices`, `payments`, `reconciliation`, `provider_month`. The canonical vocabulary is the set of provider slugs defined in the pools of `apps/operation/forager/secrets/credits.json`; `harvest.PROVIDERS` (email classifier, also the slug→category map) and `wise.ALIAS` (Wise counterparty matcher) must both emit exactly those slugs.

## Rules

- **Apps read pipes only** — never re-pull datasources directly.
- **Schemas change only via this folder** — run `tb --cloud deploy` from here. Datasource columns need `json:$.field` JSONPaths (Events API requires them).
- **Admin token** lives in local `.tinyb` only, never in SOPS.
- **Never truncate/recreate `invoices` or `overrides` without a FORWARD_QUERY** — operator truth (label rows, manual values) lives in them. Everything else is re-derivable.
