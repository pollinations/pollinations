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

**Pipes** (read-only endpoints for UI):

| Pipe | Query | Audience |
|---|---|---|
| `invoices_ep` | All invoices, ordered by provider × month | Dashboard, audit |
| `gaps_ep` | Reconciliation rows with status in (missing_invoice, amount_mismatch, needs_label) | Chase list |
| `coverage_ep` | All reconciliation rows with month/provider/billing/status/usd amounts | Grid view |

## Rules

- **Apps read pipes only** — never re-pull datasources directly.
- **Schemas change only via this folder** — run `tb --cloud deploy` from here.
- **Admin token** lives in local `.tinyb` only, never in SOPS.
- More datasources arrive with later treasury phases.
