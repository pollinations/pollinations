# Cloudflare Connector Guide

Canonical vendor: `cloudflare`

Canonical accounts:

- `pollinations` — legacy Pollinations.ai account, reviewed through June 2026.
- `myceli` — Myceli.AI OÜ account, active from February 2026.

## Verified — 2026-08-22

- Status: the deprecated billing-history API still works for both configured
  account contexts.
- Credit consumption still requires dashboard evidence; history rows are
  invoice/payment evidence and are not a complete usage ledger.
- Dashboard logins are account-specific: `elliot@pollinations.ai` for the
  legacy Pollinations account and `elliot@myceli.ai` for Myceli. The account
  title shown by Cloudflare is not the login-email source of truth.
- The legacy Pollinations account has no credits page. Its invoices page is
  the authoritative dashboard source and currently shows a USD 1,073.17
  payable invoice; this is a liability, not prepaid cash or remaining credit.
- The Billable usage view exposes completed billing periods and product-level
  costs before the consolidated invoice appears. The Aug 2026 period was
  2026-07-22 through 2026-08-21; Cloudflare says the invoice can follow within
  24 hours.

Use when:

- collecting Cloudflare infrastructure billing
- collecting Cloudflare startup credit consumption
- reconciling Cloudflare invoices, refunds, or Wise reimbursement context

Primary evidence sources:

- Invoice/payment: Cloudflare invoice PDFs and billing history.
- Dashboard/usage: Cloudflare dashboard billing and credits pages.
- Legacy Pollinations invoices:
  `https://dash.cloudflare.com/efdcb0933eaac64f27c0b295039b28f2/billing/invoices`.
- API: `GET https://api.cloudflare.com/client/v4/user/billing/history?per_page=50`
  - Cloudflare currently documents `/user/billing/history` as deprecated. Use it only for billing-history evidence until a replacement source is chosen.
- Transaction context: `economics_bank_ledger` vendor `cloudflare`.

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
5. For a completed billing period whose invoice is not yet available, archive
   the Billable usage view and record its exact total as dashboard evidence.
   Replace or confirm it with the consolidated invoice when issued.
6. Treat the period label as a billing-cycle label, not a calendar month. Keep
   the observed cycle dates in evidence and assign the ledger month consistently
   with the invoice issue/end month.
7. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

Expected entry:

- `provider_account_id`: `pollinations` or `myceli`
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
