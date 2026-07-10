# DigitalOcean Connector Guide

Canonical vendor: `digitalocean`

## Empirical status — 2026-07-10

- Status: blocked by the stored token's scope, not by API availability.
- `GET /v2/account` succeeded and reported an active account.
- Both `/v2/customers/my/balance` and `/billing_history` returned HTTP 403.
- Replace or re-scope `DIGITALOCEAN_TOKEN` with `billing:read`; until then,
  use invoices and dashboard evidence. Do not interpret the 403 as zero.

Use when:

- collecting DigitalOcean balance, billing history, invoice, or usage evidence
- tracking DigitalOcean promotional credits and their cash transition
- reconciling DigitalOcean infrastructure cost to Economics

Required credential:

- `DIGITALOCEAN_TOKEN` with `billing:read` scope

Collection steps:

1. Query the current balance:

   ```bash
   curl --fail-with-body --silent --show-error \
     "https://api.digitalocean.com/v2/customers/my/balance" \
     -H "Authorization: Bearer $DIGITALOCEAN_TOKEN"
   ```

2. Query billing history and follow `links.pages.next` only as far as needed:

   ```bash
   curl --fail-with-body --silent --show-error \
     "https://api.digitalocean.com/v2/customers/my/billing_history?per_page=100" \
     -H "Authorization: Bearer $DIGITALOCEAN_TOKEN"
   ```

3. Use invoices or Billing Insights when a closed-month or resource breakdown
   is required. Save raw evidence to `data/inbox/`.
4. Use `agent.system.txt` to extract or reconcile it.

Expected entry:

- `cost_category`: `infrastructure`
- `op_cloud_type`: `infra`
- `op_transaction_category`: `cloud` for invoices/payments
- `should_match_op_transaction`: true only for invoice/payment evidence
- `should_match_op_cloud`: true for usage/cost evidence

Known traps:

- Monetary fields are strings.
- `month_to_date_usage` is partial and gross before credit application.
- Balance is a current snapshot; it does not prove a historical month.
- Billing history can show credit grants and expirations, but a future expiry
  may still require dashboard or grant-document evidence.
- Do not forecast from partial current-month usage.

Official reference:

- https://docs.digitalocean.com/platform/billing/reference/api/
