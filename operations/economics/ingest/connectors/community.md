# Community Connector Guide

Canonical vendor: `community`

## Verified — 2026-07-10

- Status: working internal Economics meter; no external provider API is needed.
- Meter values are internal settlement evidence, not bank cash.

Use when:

- explaining community rows that have no external invoice
- reconciling creator payouts (`model_paid` / `model_quests`) against `economics_pollen_usage`
- **not** booking `cost_paid` as a provider bill — community `total_cost` is the sale price, not cash we pay an upstream

Primary evidence sources:

- Internal meter: Tinybird `economics_pollen_usage` rows where `vendor = 'community'`.
- Legacy Forager source: `pollen_monthly`, if operating in the old Forager workspace.

Required credential:

- Tinybird read token for the Economics/operations workspace.

Live validation:

- Read-only `economics_pollen_usage` query tested on 2026-07-10.
- The old Forager connector path against `pollen_monthly` returned 403/resource-not-found in the current Economics workspace, so use `economics_pollen_usage` here.

Collection steps:

1. Query community pollen settlement for the requested period:

   ```sql
   SELECT
     month,
     round(sumMerge(price_paid), 4) AS price_paid,
     round(sumMerge(model_paid), 4) AS model_paid,
     round(sumMerge(cost_paid), 4) AS cost_paid,
     count() AS rows
   FROM economics_pollen_usage
   WHERE vendor = 'community'
   GROUP BY month
   ORDER BY month
   ```

   Save raw query output to `data/inbox/community-<period>-pollen-usage.json` or `.tsv`.

2. Treat `model_paid` as the owner payout (already netted out of revenue as eco). Do **not** treat `cost_paid + cost_quests` as a provider cost — that meter copied the sale price and double-counts the payout.
3. Do **not** book community into `economics_compute_ledger`. There is no upstream invoice.
4. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

Expected entry:

- `cost_category`: `model`
- `op_cloud_type`: `null`
- `op_transaction_category`: `null`
- `should_match_op_transaction`: false
- `should_match_op_cloud`: false

Known traps:

- There is no external provider invoice for `community`; our pollen ledger is the source of truth.
- Do not use Wise/card matching for community rows.
- The legacy Forager connector reads `pollen_monthly`; Economics uses `economics_pollen_usage`.
- Historical raw `cost_paid` on community rows is the sale price, not a provider bill. `economics_pollen_usage_api` normalizes it to 0, and `economics_pollen_usage_mv` stores 0 for new rows.
- Zero rows in early months can be valid if no community models were used.

Reconciliation notes:

- Community rows are pollen-priced/internal by construction.
- Do not mirror community `cost_paid` into `economics_compute_ledger`. The 75% owner reward is `model_paid`, already subtracted from revenue.
