# Community Connector Guide

Canonical vendor: `community`

## Verified — 2026-07-10

- Status: working internal Economics meter; no external provider API is needed.
- Meter values are internal settlement evidence, not bank cash.

Use when:

- mirroring community model payouts/costs from our own pollen ledger
- explaining community provider rows that have no external invoice
- reconciling creator-deployed model costs against `op_pollen`

Primary evidence sources:

- Internal meter: Tinybird `op_pollen` rows where `vendor = 'community'`.
- Legacy Forager source: `pollen_monthly`, if operating in the old Forager workspace.

Required credential:

- Tinybird read token for the Economics/operations workspace.

Live validation:

- Read-only `op_pollen` query tested on 2026-07-10.
- The old Forager connector path against `pollen_monthly` returned 403/resource-not-found in the current Economics workspace, so use `op_pollen` here.

Collection steps:

1. Query community pollen cost for the requested period:

   ```sql
   SELECT
     month,
     round(sum(cost_paid), 4) AS cost_paid,
     round(sum(cost_quests), 4) AS cost_quests,
     count() AS rows
   FROM op_pollen
   WHERE vendor = 'community'
   GROUP BY month
   ORDER BY month
   ```

   Save raw query output to `data/inbox/community-<period>-op-pollen.json` or `.tsv`.

2. Treat `cost_paid + cost_quests` as the community provider cost witness.
3. Book this as credit/internal settlement, not external cash.
4. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

Expected entry:

- `cost_category`: `model`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `null`
- `should_match_op_transaction`: false
- `should_match_op_cloud`: true

Known traps:

- There is no external provider invoice for `community`; our pollen ledger is the source of truth.
- Do not use Wise/card matching for community rows.
- The legacy Forager connector reads `pollen_monthly`; Economics uses `op_pollen`.
- Zero rows or zero cost in early months can be valid if no community model cost was booked.

Reconciliation notes:

- Community rows are pollen-priced/internal by construction.
- If community appears in `op_pollen` but not `op_cloud`, mirror the cost into `op_cloud` as reviewed internal provider evidence.
