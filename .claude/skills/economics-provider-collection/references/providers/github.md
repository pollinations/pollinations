# GitHub Connector Guide

Canonical vendor: `github`

## Verified — 2026-08-21

- Status: organization metered usage is available programmatically through the
  enhanced-billing REST API.
- Fixed Enterprise subscriptions are not included in that usage response;
  receipts from GitHub Billing or email remain authoritative for them.
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
2. Save gross, discount, net, quantity, and SKU detail as raw evidence.
3. Download the month's fixed-subscription receipt separately.
4. Match negative Wise charges to the receipt.
5. Resolve positive GitHub transfers through Wise transfer detail. A reference
   beginning `GITHUB SPONSORS/` maps to `revenue`.

Official reference:

- https://docs.github.com/en/rest/billing/usage

Known traps:

- A net-zero metered response can still contain fully discounted Actions usage.
- The metered API does not prove the fixed Enterprise subscription amount.
- Do not net Sponsors payouts against GitHub infrastructure spend.
