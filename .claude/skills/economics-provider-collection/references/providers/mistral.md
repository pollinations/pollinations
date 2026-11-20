# Mistral Connector Guide

Canonical vendor: `mistral`

## Verified — 2026-08-21

- Status: the Admin Usage API requires Enterprise access and a dedicated Admin
  API key. Ordinary inference keys do not work; use the dashboard and original
  invoice when approved Admin access is unavailable.
- The direct Mistral account was prepaid in July 2026. Routes served by Azure or
  OpenRouter belong to those billing providers, not the direct Mistral account.

Primary evidence sources:

- API: `GET https://api.mistral.ai/v1/admin/usage?month={m}&year={yyyy}` with
  `x-api-key: MISTRAL_ADMIN_API_KEY`.
- Dashboard: Admin Panel → Subscriptions → Billing. Verify organization,
  available prepaid balance, pending usage, purchase/grant history and invoices.
- Invoice/Wise: prepaid top-up cash evidence.

Official reference:

- https://docs.mistral.ai/admin/admin-api/usage-metrics

Collection steps:

1. Query the Admin Usage API for every closed month when an approved admin key
   is available; otherwise use the authenticated dashboard.
2. Save the monthly usage response and a dated balance snapshot.
   In organization Usage, clear filters and set the requested UTC interval.
   The date picker can display local time; verify the resulting `from` and `to`
   timestamps. Export hourly Usage Type and Model Name detail and retain the
   exact end timestamp for a partial month.
3. Treat the July top-up as prepaid cash. Match future direct-account burn
   cumulatively against that balance rather than by invoice month.
4. Reconcile only OP Pollen rows whose actual billing vendor is `mistral`.

## Verified — 2026-10-01

- The Myceli direct account billed September service, so it remains in monthly
  account coverage despite an earlier provisional August end date.
- The original monthly invoice can arrive on the first day of the next month.
  Its `Pay As You Go details` section states the previous month's service
  dates and line-item usage before prepaid credit is applied. Archive the PDF
  by its issue date, book gross service usage to its stated service month, and
  keep the credit application separate from usage and cash payment.

Known traps:

- Do not use the runtime inference key as an Admin API credential.
- A prepaid invoice is funding, not proof that the credits were consumed.
- Do not move Azure/OpenRouter-routed Mistral models into direct Mistral costs.
- Progressive invoices can repeat cumulative usage and subtract `Usage already
  billed`. Book final monthly cumulative usage once; reconcile progressive
  subtotals and prepaid application separately. Receipt emails can attach both
  the receipt and its invoice; deduplicate only identical invoice bytes.
- Usage Cost is a price-catalog estimate. Its CSV may contain usage quantities
  and request counts without cost columns. Preserve displayed component totals
  and rounding differences; keep pending PAYG as a separate billing observation
  with its own coverage limits. Neither substitutes for the final invoice.
- A date-only prepaid application and a later consumed lot can support an
  accounting reconstruction, but cannot prove wallet state at an exact earlier
  UTC cutoff. Keep that limitation and never backdate a current balance.
