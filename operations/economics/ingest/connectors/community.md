# Community Connector Guide

Canonical vendor: `community`

## Verified — 2026-07-10

- Status: working internal Economics meter; no external provider API is needed.
- Meter values are internal settlement evidence, not bank cash.

Use when:

- explaining community rows that have no external invoice
- reconciling creator payouts (`model_paid` / `model_quests`) against `op_pollen`
- **not** booking `cost_paid` as a provider bill — community `total_cost` is the sale price, not cash we pay an upstream

Primary evidence sources:

- Internal meter: Tinybird `op_pollen` rows where `vendor = 'community'`.
- Legacy Forager source: `pollen_monthly`, if operating in the old Forager workspace.

Required credential:

- Tinybird read token for the Economics/operations workspace.

Live validation:

- Read-only `op_pollen` query tested on 2026-07-10.
- The old Forager connector path against `pollen_monthly` returned 403/resource-not-found in the current Economics workspace, so use `op_pollen` here.

Collection steps:

1. Query community pollen settlement for the requested period:

   ```sql
   SELECT
     month,
     round(sum(price_paid), 4) AS price_paid,
     round(sum(model_paid), 4) AS model_paid,
     round(sum(cost_paid), 4) AS cost_paid,
     count() AS rows
   FROM op_pollen
   WHERE vendor = 'community'
   GROUP BY month
   ORDER BY month
   ```

   Save raw query output to `data/inbox/community-<period>-op-pollen.json` or `.tsv`.

2. Treat `model_paid` as the owner payout (already netted out of revenue as eco). Do **not** treat `cost_paid + cost_quests` as a provider cost — that meter copied the sale price and double-counts the payout.
3. Do **not** book community into `op_cloud`. There is no upstream invoice.
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
- The legacy Forager connector reads `pollen_monthly`; Economics uses `op_pollen`.
- Historical raw `cost_paid` on community rows is the sale price, not a provider bill. `op_pollen_api` normalizes it to 0, and `op_pollen_populate` stores 0 for new rows.
- Zero rows in early months can be valid if no community models were used.

Reconciliation notes:

- Community rows are pollen-priced/internal by construction.
- Do not mirror community `cost_paid` into `op_cloud`. The 75% owner reward is `model_paid`, already subtracted from revenue.
