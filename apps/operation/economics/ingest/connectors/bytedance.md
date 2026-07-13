# BytePlus / ByteDance Connector Guide

Canonical vendor: `bytedance`

## Verified — 2026-07-10

- Status: historical/manual connector, not a current provider billing API.
- The direct Model Ark key returned HTTP 401, and current Seedance/Seedream
  handlers in the repository route through Replicate.
- Use this guide for historical `bytedance` facts and old BytePlus evidence.
  Use `replicate.md` for current Seedance/Seedream provider collection.

Use when:

- auditing historical direct BytePlus / ByteDance usage evidence
- checking an old BytePlus credit balance or grant document
- reconciling legacy `bytedance` rows already present in `op_cloud`

Primary evidence sources:

- Historical usage: Tinybird `op_pollen` rows where `vendor = 'bytedance'`.
- Historical detail: bounded `generation_event` rows for old direct BytePlus models.
- Current Seedance/Seedream provider activity: use `replicate.md`.
- Balance/expiry: BytePlus Console → Cost Center screenshot or export.
- Cash: invoice, receipt, Wise, or `op_transactions`.

Collection steps:

1. Query the requested period from `op_pollen` first:

   ```sql
   SELECT
     month,
     round(sum(cost_paid), 4) AS cost_paid,
     round(sum(cost_quests), 4) AS cost_quests,
     count() AS rows
   FROM op_pollen
   WHERE vendor = 'bytedance'
   GROUP BY month
   ORDER BY month
   ```

2. If model detail is needed, query `generation_event` for the bounded period
   and the relevant `seedance*` / `seedream*` model names.
3. Ask the operator for a current Cost Center screenshot when balance or expiry
   matters. The international Model Ark API exposes models and generation, not
   a supported billing or credit-balance endpoint.
4. Save evidence to `data/inbox/`, present the source and timestamp, and use
   `agent.system.txt` to extract or reconcile it.

Expected entry:

- `cost_category`: `model`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `cloud` for a payment, otherwise `null`
- `should_match_op_transaction`: true only for invoice/payment evidence
- `should_match_op_cloud`: true for usage evidence

Known traps:

- The production key is a runtime credential, not a billing credential. Do not
  make a generation request merely to test billing access.
- Console credit balance is a current snapshot, not historical burn.
- Legacy Seedream names must be included when auditing old periods.
- Tinybird cost and Console cost can differ if the registry price is stale;
  preserve the discrepancy instead of silently choosing one.
- Do not add a balance cache or background poller.

Official reference:

- https://docs.byteplus.com/en/docs/ModelArk
