# GitHub Connector Guide

Canonical vendor: `github`

## Verified — 2026-11-03

- Status: organization metered usage is available programmatically through the
  enhanced-billing REST API.
- Enhanced billing usage can include Enterprise Cloud license SKUs. Reconcile
  their account scope and amount to the original billing receipt; do not book
  the API amount and receipt as separate expenses.
- GitHub Sponsors deposits are revenue, never cloud-cost refunds.

Primary evidence sources:

- API: `GET /organizations/{org}/settings/billing/usage` with bounded `year`
  and `month` parameters.
- Billing dashboard/receipts: fixed subscription invoices and receipts.
- Wise transfer detail or statement: settled GitHub Sponsors payouts.

Required access:

- GitHub authentication with organization billing access and `read:org`.
- Wise connector for settled cash evidence.

Collection steps:

1. Query every closed month through the organization billing usage endpoint.
   For enterprise accounts, also collect
   `/enterprises/{enterprise}/settings/billing/usage/summary` with explicit
   year/month for all cost centers. The enterprise `/usage` default excludes
   cost-center-assigned usage; combine its detail with organization usage and
   reconcile to the enterprise-wide summary.
2. Save gross, discount, net, quantity, and SKU detail as raw evidence.
3. Open enterprise **Billing and licensing → Payment history**. Each payment
   has separate **Download receipt** and **Download invoice(s)** controls;
   retain both originals and their distinct payment and service dates.
4. Match negative Wise charges to the original invoice and receipt.
5. Resolve positive GitHub transfers through Wise transfer detail. A reference
   beginning `GITHUB SPONSORS/` maps to `revenue`.
6. Open **Billing and licensing → Licensing** for consumed and billable
   licenses, estimated monthly payment and next due date. Download the
   Enterprise Cloud CSV report. An existing browser login can supply this
   evidence when the consumed-licenses API lacks permission; do not change
   token scopes merely to read it.

Official reference:

- https://docs.github.com/en/rest/billing/usage

Known traps:

- A net-zero metered response can still contain fully discounted Actions usage.
- Discounts include free quotas and public-repository Actions usage; they do
  not prove promotional-credit consumption. Preserve gross, discount and net;
  book net billed usage unless separate funding evidence says otherwise.
- API usage is daily billing detail; user/workflow reports are web-only.
  Inspect current licenses and billing documents before forecasting recurring
  seats, especially when daily seat quantities changed during the month.
- Do not net Sponsors payouts against GitHub infrastructure spend.
- Organization Enterprise seat usage can be a subset of the enterprise-wide
  receipt. Keep Enterprise subscriptions separate from Actions/Packages;
  do not add both the organization subtotal and enterprise receipt as costs.
  Receipt issue date is not its service month.
