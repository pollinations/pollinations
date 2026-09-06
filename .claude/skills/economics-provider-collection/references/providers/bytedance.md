# BytePlus / ByteDance Connector Guide

Canonical vendor: `bytedance`

## Verified — 2026-08-21

- Status: historical dashboard/invoice connector. Direct BytePlus usage ended
  after May 2026; current Seedance/Seedream handlers route through Replicate.
- Account: Myceli.AI OÜ (`3000852661`).
- Use this guide for historical `bytedance` facts and old BytePlus evidence.
  Use `replicate.md` for current Seedance/Seedream provider collection.

## Verified — 2026-09-06

- Review funding per invoice. `paid` includes cash-billed usage even before
  settlement; `credit` requires evidence of a coupon or waived obligation.
  Record the decision, amount, and evidence on the ledger row, not here.

Primary evidence sources:

- Historical usage: Tinybird `economics_pollen_usage` rows where `vendor = 'bytedance'`.
- Historical detail: bounded `generation_event` (pre-v2 archive) rows for old direct BytePlus models.
- Exact 2026 configuration detail: BytePlus Billing center → Cost analysis →
  group by Configuration Name.
- Current Seedance/Seedream provider activity: use `replicate.md`.
- Provider usage: BytePlus Console → Billing center → Cost analysis → monthly
  costs by product.
- 2026 provider/Pollen reconciliation: https://drive.google.com/file/d/124mpTlfa0RIh3Dy1fFTaLle0hq5RVgvW/view?usp=drivesdk
- Contract and discount terms: https://drive.google.com/file/d/11ih6rA-gHyVByv4dFlllBKJWj3ie_LNN/view?usp=drivesdk
- Cash: invoice, receipt, Wise, or `economics_bank_ledger`.

Validation:

- Compare Cost Analysis totals with archived invoices for each month.
- Preserve configuration labels, SKU, and line items as collected. Model joins
  belong in the registry's reviewed `modelLabels`, not rewritten ledger facts.
- Record coupon scope, validity, consumed amount, and unused expiry separately.
  Expired coupons do not fund later usage.

Collection steps:

1. Query the requested period from `economics_pollen_usage` first:

   ```sql
   SELECT
     month,
     round(sumMerge(cost_paid), 4) AS cost_paid,
     round(sumMerge(cost_quests), 4) AS cost_quests,
     count() AS rows
   FROM economics_pollen_usage
   WHERE vendor = 'bytedance'
   GROUP BY month
   ORDER BY month
   ```

2. If model detail is needed, query `generation_event_v2` (or the archived
   `generation_event` for periods before the v2 cutover) for the bounded period
   and the relevant `seedance*` / `seedream*` model names.
3. Use Cost Analysis for a calendar-month range, group by Configuration Name,
   and record explicit zero months. The international Model Ark API does not
   expose a supported billing or credit-balance endpoint.
4. Save evidence to `data/inbox/`, present the source and timestamp, and use
   this skill to extract or reconcile it.

Known traps:

- The production key is a runtime credential, not a billing credential. Do not
  make a generation request merely to test billing access.
- Console credit balance is a current snapshot, not historical burn.
- Correct legacy deal-credit assumptions only with exact invoice/configuration
  rows and verified coupon evidence, through an approved correction batch.
- Do not infer credit funding from `Amount paid = 0`: an uncleared invoice is a
  payable, not promotional credit.
- Keep the pay-by-credits balance separate from usage funding and historical
  coupon evidence.
- Legacy Seedream names must be included when auditing old periods.
- Tinybird cost and Console cost can differ if the registry price is stale;
  preserve the discrepancy instead of silently choosing one.
- Do not add a balance cache or background poller.

Official reference:

- https://docs.byteplus.com/en/docs/ModelArk
