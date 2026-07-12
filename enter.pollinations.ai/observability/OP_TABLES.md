# OP Tables (Economics)

Economics owns four OP resources in this workspace, alongside enter's own
datasources/endpoints/materializations.

## OP Tables

| Pipe | Datasource | Notes |
| --- | --- | --- |
| `op_transactions_api` | `op_transactions` | Signed Wise cash movements, in and out. |
| `op_cloud_api` | `op_cloud` | Cloud/provider usage, spend, credit, grants, and manual evidence. |
| `op_pollen_api` | `op_pollen` | Product usage in Pollen with paid/quest splits and byop/model payouts, per month/provider/model. `op_pollen` is maintained by `op_pollen_populate`, an incremental materialization straight off `generation_event` (500M+ rows in prod — an endpoint query can't scan that live). Not manually ingested. |
| `op_runway_api` | `op_runway` | Latest agent- or manually-authored cash balance and forecast facts. |

## Idempotent Writes

`op_transactions`, `op_cloud`, and `op_runway` are append-only and every row
carries a stable `entry_id` plus a millisecond-precision `recorded_at`.
Re-registering a fact that already exists must reuse its `entry_id`; a
correction appends the same `entry_id` with a newer `recorded_at`. Each
`*_api` pipe returns only the latest revision per `entry_id`, so duplicate or
corrected appends can never double-count in the app.

`op_pollen` does not follow this pattern — it has no `entry_id` and is never
manually appended to. It's a running aggregate maintained by
`op_pollen_populate` off `generation_event`, so there is no fact to correct or
deduplicate, only sums to read back with `sumMerge`.

`entry_id` must be deterministic from the fact's identity, never from
ingestion time. Conventions:

- `op_cloud`: `{source}:{vendor}:{type}:{start}:{resource_id or resource_name}:{model}`,
  extended with the SKU or a line-item suffix when one period legitimately has
  several rows for the same resource.
- `op_transactions`: the native bank identifier (Wise transfer/transaction ID).
  Two genuinely separate transfers always have distinct native IDs, even when
  date, vendor, and amount are identical.
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

## Tokens

- `operations_ingest`: APPEND + READ on `op_cloud`, `op_runway`, `op_transactions`.
  Used by the ingest agent.
- `operations_read`: READ on all four `*_api` endpoints. Used by the economics
  web app's server-side proxy (`apps/operation/economics/secrets/web.json`).

Deploy from this directory with Tinybird Cloud.
