# Economics Tinybird

Economics owns the OP Tinybird read surface.

## OP Tables

| Pipe | Datasource | Notes |
| --- | --- | --- |
| `op_transactions_api` | `op_transactions` | Signed Wise cash movements, in and out. |
| `op_cloud_api` | `op_cloud` | Cloud/provider usage, spend, credit, grants, and manual evidence. |
| `op_pollen_api` | `op_pollen` | Product usage in Pollen with paid/quest splits, including request counts. |
| `op_runway_api` | `op_runway` | Latest agent- or manually-authored cash balance and forecast facts. |

## Idempotent Writes

Every OP table is append-only and every row carries a stable `entry_id` plus a
millisecond-precision `recorded_at`. Re-registering a fact that already exists
must reuse its `entry_id`; a correction appends the same `entry_id` with a newer
`recorded_at`. Each `*_api` pipe returns only the latest revision per
`entry_id`, so duplicate or corrected appends can never double-count in the app.

`entry_id` must be deterministic from the fact's identity, never from ingestion
time. Conventions:

- `op_cloud`: `{source}:{vendor}:{type}:{start}:{resource_id or resource_name}:{model}`,
  extended with the SKU or a line-item suffix when one period legitimately has
  several rows for the same resource.
- `op_transactions`: the native bank identifier (Wise transfer/transaction ID).
  Two genuinely separate transfers always have distinct native IDs, even when
  date, vendor, and amount are identical.
- `op_pollen`: `{source}:{month}:{vendor}:{model}` — the table's natural monthly
  grain.
- `op_runway`: see Runway Facts below.

## Runway Facts

`op_runway` is append-only. Corrections append a row with the same `entry_id` and a
newer, millisecond-precision `recorded_at`; `op_runway_api` returns only that latest
revision. Each revision contains:

- `kind`: `opening_balance` for a dated cash balance or `forecast` for a dated cash
  movement.
- An `opening_balance` is the cash position at the start of its calendar month;
  Economics uses it for both that month's Current Wise cash position and its
  separate full-month Forecast. Use the first day of the month.
- `amount`: signed in `currency`; forecast inflows are positive and outflows are
  negative.
- `vendor` and `category`: attribution for forecast rows; use empty strings when
  they do not apply to an opening balance.
- `source`: `agent` or `manual`.
- `evidence`: a human-readable reference supporting the value.

The current month keeps Current Wise actuals from `op_transactions` separate
from the full-month `forecast` facts. An agent materializes forecasts using only
`last` or `zero`; evidence records the method, Wise or cloud basis, and
completed source months. The page does not calculate or carry forecast rules.

Economics converts each fact to USD using the same monthly FX table as the other
financial insights.

Deploy from this directory with Tinybird Cloud.
