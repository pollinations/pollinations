# Mistral Connector Guide

Canonical vendor: `mistral`

## Verified — 2026-08-21

- Status: Mistral exposes a monthly Admin Usage API, but it requires a dedicated
  workspace Admin API key. The current runtime key returned `401` for this API.
- The direct Mistral account was prepaid in July 2026. Routes served by Azure or
  OpenRouter belong to those billing providers, not the direct Mistral account.

Primary evidence sources:

- API: `GET https://api.mistral.ai/v1/admin/usage?month={m}&year={yyyy}` with
  `x-api-key: MISTRAL_ADMIN_API_KEY`.
- Dashboard: usage and remaining prepaid balance.
- Invoice/Wise: prepaid top-up cash evidence.

Official reference:

- https://docs.mistral.ai/admin/admin-api/usage-metrics

Collection steps:

1. Query the Admin Usage API for every closed month when an approved admin key
   is available; otherwise use the authenticated dashboard.
2. Save the monthly usage response and a dated balance snapshot.
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
