# Cloudflare Connector Guide

Canonical vendor: `cloudflare`

## Verified — 2026-07-10

- Status: the deprecated billing-history API still works for both configured
  account contexts.
- Credit consumption still requires dashboard evidence; history rows are
  invoice/payment evidence and are not a complete usage ledger.

Use when:

- collecting Cloudflare infrastructure billing
- collecting Cloudflare startup credit consumption
- reconciling Cloudflare invoices, refunds, or Wise reimbursement context

Primary evidence sources:

- Invoice/payment: Cloudflare invoice PDFs and billing history.
- Dashboard/usage: Cloudflare dashboard billing and credits pages.
- API: `GET https://api.cloudflare.com/client/v4/user/billing/history?per_page=50`
  - Cloudflare currently documents `/user/billing/history` as deprecated. Use it only for billing-history evidence until a replacement source is chosen.
- Transaction context: `op_transactions` vendor `cloudflare`.

Collection steps:

1. For invoices, place PDFs in `data/inbox/`.
2. For billing history API evidence, query per account token. Required env vars for the known local accounts:
   - `CLOUDFLARE_POLLINATIONS_BILLING_TOKEN`
   - `CLOUDFLARE_MYCELI_API_TOKEN`

   The token must have access to the Cloudflare user/account billing context being collected. Do not print token values.

   ```bash
   token_name="CLOUDFLARE_POLLINATIONS_BILLING_TOKEN" # or CLOUDFLARE_MYCELI_API_TOKEN
   token_value="$(eval "printf %s \"\${$token_name}\"")"
   test -n "$token_value" || { echo "$token_name missing"; exit 1; }

   curl --fail-with-body --silent --show-error \
     "https://api.cloudflare.com/client/v4/user/billing/history?per_page=50" \
     -H "Authorization: Bearer $token_value"
   ```

   Save raw JSON to `data/inbox/cloudflare-<account>-<period>-billing-history.json`.

3. The billing history endpoint is not period-scoped. Save the raw response, then filter locally to the requested provider period. If the target period is absent from the first page, stop and ask before paginating broadly.
4. For startup credit consumption, use dashboard screenshots/exports from the relevant account billing credits page and save to `data/inbox/`.
5. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

Expected entry:

- `cost_category`: `infrastructure`, `network`, `storage`, or `credit`
- `op_cloud_type`: `infra`
- `op_transaction_category`: `cloud` for invoices/payments/refunds, `null` for pure dashboard/API credit-burn or usage evidence
- `should_match_op_transaction`: true for invoices/payments/refunds, false for pure dashboard/API credit-burn or usage evidence
- `should_match_op_cloud`: true for infra usage, billing, or credit consumption

Known traps:

- Cloudflare is treated as infrastructure, not model inference.
- Myceli account startup credits can zero invoices before they appear as card billing.
- Startup credit burn may be visible only in the dashboard, not the billing history API.
- A mistaken June 2026 card charge was refunded; do not double count charge and refund as cost.
- The `/user/billing/history` endpoint scopes to the token/account context.

Reconciliation notes:

- API billing history helps cash/invoice truth.
- Dashboard credit pages help usage/credit-burn truth.
- Refunds should be represented carefully in transaction reconciliation.
