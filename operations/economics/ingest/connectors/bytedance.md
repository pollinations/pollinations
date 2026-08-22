# BytePlus / ByteDance Connector Guide

Canonical vendor: `bytedance`

## Verified — 2026-08-21

- Status: historical dashboard/invoice connector. Direct BytePlus usage ended
  after May 2026; current Seedance/Seedream handlers route through Replicate.
- Account: Myceli.AI OÜ (`3000852661`).
- Use this guide for historical `bytedance` facts and old BytePlus evidence.
  Use `replicate.md` for current Seedance/Seedream provider collection.

Use when:

- auditing historical direct BytePlus / ByteDance usage evidence
- checking an old BytePlus credit balance or grant document
- reconciling legacy `bytedance` rows already present in `op_cloud`

Primary evidence sources:

- Historical usage: Tinybird `op_pollen` rows where `vendor = 'bytedance'`.
- Historical detail: bounded `generation_event` (pre-v2 archive) rows for old direct BytePlus models.
- Current Seedance/Seedream provider activity: use `replicate.md`.
- Provider usage: BytePlus Console → Billing center → Cost analysis → monthly
  costs by product.
- 2026 provider/Pollen reconciliation: https://drive.google.com/file/d/124mpTlfa0RIh3Dy1fFTaLle0hq5RVgvW/view?usp=drivesdk
- Contract and discount terms: https://drive.google.com/file/d/11ih6rA-gHyVByv4dFlllBKJWj3ie_LNN/view?usp=drivesdk
- Cash: invoice, receipt, Wise, or `op_transactions`.

Live validation:

- Jan–May 2026 Cost Analysis totals exactly match the archived invoices:
  `$5,812.84`, `$2,333.05`, `$1,036.80`, `$550.51`, and `$227.71`.
- June, July, and August 2026 are verified zero.
- Jan–May total provider usage is `$9,960.91`.
- On 2026-08-21 the ordinary pay-by-credits balance was `$14.79`; there were
  no active coupons.

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

2. If model detail is needed, query `generation_event_v2` (or the archived
   `generation_event` for periods before the v2 cutover) for the bounded period
   and the relevant `seedance*` / `seedream*` model names.
3. Use Cost Analysis for a calendar-month range and record both product detail
   and explicit zero months. The international Model Ark API does not expose a
   supported billing or credit-balance endpoint.
4. Save evidence to `data/inbox/`, present the source and timestamp, and use
   `agent.system.txt` to extract or reconcile it.
5. Run `ingest/scripts/bytedance-2026-reconcile.mjs` before publishing a
   reviewed historical correction.

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
- The legacy `$10,000` deal-credit row is preserved, but its original award
  document and expiry are not verified. The current balance is `$24.30` below
  the simple award-minus-2026-usage calculation; do not invent a classification
  for that difference.
- Legacy Seedream names must be included when auditing old periods.
- Tinybird cost and Console cost can differ if the registry price is stale;
  preserve the discrepancy instead of silently choosing one.
- Do not add a balance cache or background poller.

Official reference:

- https://docs.byteplus.com/en/docs/ModelArk
