# Tinybird Operations

Workspace: `operations` (`https://api.europe-west2.gcp.tinybird.co`).

## Live Contract

The Treasury app reads only these endpoint pipes:

| Pipe | Datasource | Purpose |
|---|---|---|
| `transactions_api` | `transactions` | Enty-backed spend transactions. |
| `meter_monthly_api` | `meter_monthly` | Provider-reported monthly usage. |
| `usage_monthly_api` | `usage_monthly` | Platform-metered Pollen usage. |
| `revenue_monthly_api` | `revenue_monthly` | Stripe monthly revenue. |
| `ingest_runs_api` | `ingest_runs` | Recent Forager run log. |

Operator writes append only to:

| Datasource | Writer |
|---|---|
| `overrides` | Transaction provider/category corrections. |
| `meter_monthly` | Manual provider usage rows. |

## Rules

- Keep schemas sparse. Derived values stay in the consuming app.
- Do not keep unused pipes, datasources, or columns.
- Deploy every Tinybird datafile change from this directory:

```bash
tb --cloud deploy --check --wait
tb --cloud deploy --wait
```

- Never use `--allow-destructive-operations` without explicit approval.
- Never truncate/recreate `overrides` without a `FORWARD_QUERY`.
