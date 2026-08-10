# Scaleway Connector Guide

Canonical vendor: `scaleway`

## Verified — 2026-07-10

- Status: billing API authentication works.
- Preserve each discount's currency when extracting.
- Keep the connector for historical invoices and grants; zero consumption is
  a valid API result, not a credential failure.

Use when:

- collecting Scaleway consumption, invoice, or discount evidence
- auditing historical Scaleway credit/grant rows
- reconciling Scaleway infrastructure or inference cost

Required credentials:

- `SCW_SECRET_KEY`
- `SCW_ORGANIZATION_ID`

Collection steps:

1. Query current or bounded monthly consumption:

   ```bash
   curl --fail-with-body --silent --show-error \
     "https://api.scaleway.com/billing/v2alpha1/consumption?organization_id=$SCW_ORGANIZATION_ID" \
     -H "X-Auth-Token: $SCW_SECRET_KEY"
   ```

2. List discounts for grant amount, use, remaining value, and active dates:

   ```bash
   curl --fail-with-body --silent --show-error \
     "https://api.scaleway.com/billing/v2alpha1/discounts?organization_id=$SCW_ORGANIZATION_ID" \
     -H "X-Auth-Token: $SCW_SECRET_KEY"
   ```

3. Use the invoice endpoints for closed-month obligations and downloads.
4. Save bounded evidence to `data/inbox/` and use `agent.system.txt` to
   extract or reconcile it.

Expected entry:

- `cost_category`: `infrastructure` or `model`, based on product detail
- `op_cloud_type`: `infra` or explicit `inference`
- `op_transaction_category`: `cloud` for invoices/payments
- `should_match_op_transaction`: true only for invoice/payment evidence
- `should_match_op_cloud`: true for usage/discount evidence

Known traps:

- Consumption is not real time; preserve the response's update timestamp.
- Discount `mode` determines whether `value` is a fixed amount or a rate.
- Money objects carry currency; do not assume USD.
- Expired discounts with zero remaining are historical facts, not active runway.
- Do not forecast from partial current-month consumption.

Official reference:

- https://www.scaleway.com/en/developers/api/billing
