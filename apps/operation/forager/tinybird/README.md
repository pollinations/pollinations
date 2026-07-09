# Tinybird Operations

Workspace: `operations` (`https://api.europe-west2.gcp.tinybird.co`).

## Legacy Contract

The OP Tinybird contract moved to `apps/operation/treasury/tinybird/`.

This folder is retained only for legacy Operations Tinybird files while Forager
remains available as an archive.

Legacy endpoint pipes left here:

| Pipe | Datasource | Purpose |
|---|---|---|
| `transactions_api` | `transactions` | Enty-backed spend transactions. |
| `provider_monthly_api` | `provider_monthly` | Provider-reported monthly usage. |
| `pollen_monthly_api` | `pollen_monthly` | Platform-metered Pollen usage. |
| `revenue_monthly_api` | `revenue_monthly` | Stripe monthly revenue. |
| `ingest_runs_api` | `ingest_runs` | Recent Forager run log. |

Operator writes append only to:

| Datasource      | Writer                      |
|-----------------|-----------------------------|
| `provider_monthly` | Manual vendor usage rows. |

## Rules

- Keep schemas sparse. Derived values stay in the consuming app.
- Do not keep unused pipes, datasources, or columns.
- Deploy legacy Tinybird datafile changes from this directory:

```bash
tb --cloud deploy --check --wait
tb --cloud deploy --wait
```

- Never use `--allow-destructive-operations` without explicit approval.
- Forager remains the legacy writer while this archive exists.
