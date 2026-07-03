# Tinybird Operations Platform

Workspace: `operations` (GCP europe-west2, https://api.europe-west2.gcp.tinybird.co)

## Contract

**Datasources** (read-only grain for apps):

| Datasource | Grain | Purpose |
|---|---|---|
| `invoices` | provider, period_month, issued_at | Harvested invoices (compute, infra, SaaS, payroll, other) with canonical USD amounts; Gmail + inbox drops |
| `payments` | month, provider, paid_at | Wise outflows per transaction; unmatched counterparties keep provider empty |
| `reconciliation` | month, provider | Invoice vs. payment verdicts per provider × month; one row per match decision |
| `ingest_runs` | run_at | Harvest job execution log; ok/statuses/notes |
| `balances` | provider, run_at | Append-only live balance snapshots per provider (granted/spent/left/prepaid); latest-wins on read via balances_ep |
| `meter_monthly` | provider, month, retrieved_at | Append-only provider meter reads (cost, funding type, source method); diagnostic only, not P&L |
| `usage_monthly` | month, provider, model | Full-replace Tinybird registry-imputed usage cost per model/event; diagnostic |
| `revenue_monthly` | month | Full-replace Stripe revenue summary per month (gross/fees/refunds/net, EUR) |
| `provider_month` | provider, month | Full-replace burn-engine output: joined P&L + credit + meter + usage per provider × month |
| `grants` | pool | Full-replace pool-level grant view: credits.json base merged with latest live balance overlay |

**Pipes** (read-only endpoints for UI):

| Pipe | Query | Audience |
|---|---|---|
| `invoices_ep` | All invoices, ordered by provider × month | Dashboard, audit |
| `gaps_ep` | Reconciliation rows with status in (missing_invoice, amount_mismatch, needs_label) | Chase list |
| `coverage_ep` | All reconciliation rows with month/provider/billing/status/usd amounts | Grid view |
| `balances_ep` | Latest balance snapshot per provider (argMax over run_at) | PoC Balances tab |
| `grants_ep` | All grant pool rows ordered by pool | PoC Grants tab |
| `usage_ep` | All usage_monthly rows ordered by month/provider/model | PoC Usage tab |
| `cash_monthly_ep` | Wise payments aggregated by month × provider (paid_usd, paid_eur) | PoC Cash tab |
| `revenue_ep` | Revenue summary per month (gross/fees/refunds/net EUR) | PoC Revenue tab |
| `provider_month_ep` | Final joined provider × month table (all cost signals) | PoC main grid |

## Tokens

`operations` is a Tinybird **Forward** workspace: resource-scoped tokens are declared in the datafiles here and managed by deployments; datafile tokens cannot carry `DATASOURCES:CREATE`.

| Token | Managed by | Scopes | SOPS key (`apps/operation/secrets/env.json`) |
|---|---|---|---|
| `treasury_ingest` | datafiles | APPEND+READ on all 4 datasources | `TINYBIRD_OPS_INGEST_TOKEN` |
| `treasury_web` | datafiles | PIPES:READ on the 3 endpoint pipes | `TINYBIRD_OPS_READ_TOKEN` |
| `treasury_replace` | API (static) | `DATASOURCES:CREATE` only | `TINYBIRD_OPS_REPLACE_TOKEN` |

`tb.replace()` (mode=replace) requires CREATE scope → always use `treasury_replace`. Appends and `/v0/sql` reads use `treasury_ingest`.

## Provider slug vocabulary

The `provider` column is the join key across all three datasources (`invoices`, `payments`, `reconciliation`). The canonical vocabulary is the set of provider slugs defined in the pools of `apps/operation/secrets/credits.json`; `harvest.PROVIDERS` (email classifier) and `wise.ALIAS` (Wise counterparty matcher) must both emit exactly those slugs so that invoice rows, payment rows, and pool metadata link up correctly at reconciliation time.

## Rules

- **Apps read pipes only** — never re-pull datasources directly.
- **Schemas change only via this folder** — run `tb --cloud deploy` from here. Datasource columns need `json:$.field` JSONPaths (Events API requires them).
- **Admin token** lives in local `.tinyb` only, never in SOPS.
- More datasources arrive with later treasury phases.
