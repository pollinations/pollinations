# Pruna Connector Guide

Canonical vendor: `pruna`

## Verified — 2026-08-21

- Status: the signed-in portal exposes current prepaid balance, top-ups,
  monthly statements, and a calendar-month usage view.
- The current usage view returned zero requests and no export for every checked
  month from February through August 2026. It does not provide a historical
  backfill for the prepaid usage already recorded in the legacy ledger.
- Monthly `Pruna Model API` invoices can be zero-quantity prepaid statements.
  They are provider documents, but they do not prove prepaid balance burn.

Primary evidence sources:

- Usage: `https://dashboard.pruna.ai/usage`, one calendar month at a time.
- Balance and invoice history: `https://dashboard.pruna.ai/billing`.
- Internal product meter: Tinybird `economics_pollen_usage` rows where `vendor = 'pruna'`.
- Cash: Pruna top-up invoice/receipt plus Wise or `economics_bank_ledger`.

Required credential:

- Interactive Pruna portal session. No supported account-billing credential is
  currently stored for this connector.

Collection steps:

1. On Usage, select the exact first-to-last day calendar month and all models.
2. Export the result when Export is enabled. Otherwise record the visible total,
   model selection, request count, and the fact that export was unavailable.
3. On Billing, record the opening balance, month top-ups, and closing balance at
   the same month boundary whenever the portal does not expose historical burn.
4. Download every statement and top-up invoice. Preserve a zero statement as
   contextual provider evidence, not evidence for a nonzero usage amount.
5. Reconcile provider usage against `economics_pollen_usage` by month. Use the Pollen rows as
   internal model/request context; do not substitute their estimated cost for a
   provider total when the two sources disagree.
6. Match top-up invoices and receipts to Wise separately from provider usage.

Known traps:

- A current balance snapshot does not prove historical monthly burn.
- A top-up is cash funding, not usage. Do not add it to `economics_compute_ledger` cost.
- A zero prepaid statement must not verify a nonzero legacy usage row.
- Pruna billing cycles can run from the 26th to the 26th; do not silently map
  them to calendar months.
- If historical usage is unavailable, retain an explicit `unallocated`
  provider row and keep the amount-evidence gap open.
- Do not allocate a provider total to models from Pollen proportions unless the
  provider total itself is verified and the allocation is explicitly labeled.

Monthly close result:

- `verified`: calendar-month provider usage/export is archived.
- `balance-derived`: opening balance + top-ups - closing balance is archived,
  with any billing-cycle caveat recorded.
- `open`: neither source exists; preserve the legacy amount without a Drive
  evidence link and report the gap.
