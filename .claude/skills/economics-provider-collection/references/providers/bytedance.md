# BytePlus / ByteDance Connector Guide

Canonical vendor: `bytedance`

## Verified — 2026-08-21

- Status: historical dashboard/invoice connector. Direct BytePlus usage ended
  after May 2026; current Seedance/Seedream handlers route through Replicate.
- Account: Myceli.AI OÜ (`3000852661`).
- Use this guide for historical `bytedance` facts and old BytePlus evidence.
  Use `replicate.md` for current Seedance/Seedream provider collection.

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

Live validation:

- Jan–May 2026 Cost Analysis totals exactly match the archived invoices:
  `$5,812.84`, `$2,333.05`, `$1,036.80`, `$550.51`, and `$227.71`.
- June, July, and August 2026 are verified zero.
- Jan–May total provider usage is `$9,960.91`.
- The configuration export resolves the two invoice product families into six
  billing configurations and five canonical Pollinations models:
  - `Seedream 4.5` → `seedream-pro`
  - `seedream-4.0-Piece` → `seedream`
  - `Seedream 5.0-Lite` → `seedream5`
  - `Seedance-1.0-pro-fast-infer` → `seedance-pro`
  - both Seedance Lite I2V/T2V configurations → `seedance`
- These exact mappings cover every active ByteDance model in `economics_pollen_usage` for
  each month from January through May. Preserve each raw configuration in
  `resource_name` and `resource_sku`; use the canonical ID in `model`.
- The January–May 2026 cost is cash-billed/provider-payable, not credit-funded.
  The invoices show coupon used `$0` and amount paid `$0` because the bills are
  uncleared. No matching bank transaction should exist until payment occurs.
- On 2026-08-21 the ordinary pay-by-credits balance was `$14.79`; there were
  no active coupons.
- The only verified coupon was `$5,000`, Seedream-only, valid from 2025-10-15
  through 2025-12-31. It expired with `$1,733.09` unused. It does not fund 2026.

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
- The legacy `$10,000` deal-credit row is invalid. Supersede it only alongside
  the exact cash-billed configuration rows and the verified coupon export.
- Do not infer credit funding from `Amount paid = 0`: an uncleared invoice is a
  payable, not promotional credit.
- The `$14.79` pay-by-credits balance is an ordinary current balance snapshot;
  keep it separate from usage funding and historical coupon evidence.
- Legacy Seedream names must be included when auditing old periods.
- Tinybird cost and Console cost can differ if the registry price is stale;
  preserve the discrepancy instead of silently choosing one.
- Do not add a balance cache or background poller.

Official reference:

- https://docs.byteplus.com/en/docs/ModelArk
