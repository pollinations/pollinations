# Tinybird Operations

Workspace: `operations` (`https://api.europe-west2.gcp.tinybird.co`).

## Live Contract

The Treasury app reads only these endpoint pipes:

| Pipe | Datasource | Purpose |
|---|---|---|
| `transactions_api` | `transactions` | Enty-backed spend transactions. |
| `provider_monthly_api` | `provider_monthly` | Provider-reported monthly usage. |
| `pollen_monthly_api` | `pollen_monthly` | Platform-metered Pollen usage. |
| `revenue_monthly_api` | `revenue_monthly` | Stripe monthly revenue. |
| `ingest_runs_api` | `ingest_runs` | Recent Forager run log. |

## Next Raw Contract

The new raw Operations model is additive while migration is underway:

| Pipe | Datasource | Purpose |
|---|---|---|
| `op_transactions_api` | `op_transactions` | Signed Wise cash movements, in and out. |
| `op_cloud_api` | `op_cloud` | Cloud/provider usage, spend, credit, grants, and manual evidence. |
| `op_pollen_api` | `op_pollen` | Product usage in Pollen with paid/quest splits, including request counts. |

These use the `op_` prefix so they can later live beside production
Pollinations product datasources without colliding with legacy Operations
tables.

Operator writes append only to:

| Datasource      | Writer                      |
|-----------------|-----------------------------|
| `provider_monthly` | Manual vendor usage rows. |

## Rules

- Keep schemas sparse. Derived values stay in the consuming app.
- Do not keep unused pipes, datasources, or columns.
- Deploy every Tinybird datafile change from this directory:

```bash
tb --cloud deploy --check --wait
tb --cloud deploy --wait
```

- Never use `--allow-destructive-operations` without explicit approval.
- Forager is the only writer; the Treasury app reads these pipes and never writes.
