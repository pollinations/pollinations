# Cloudflare Connector Guide

Canonical vendor: `cloudflare`

Canonical accounts:

- `pollinations` — legacy Pollinations.ai account, reviewed through June 2026.
- `myceli` — Myceli.AI OÜ account, active from February 2026.

## Verified — 2026-08-22

- Status: the account billing-history and credits APIs work with the existing
  Myceli billing credential (verified November 3, 2026). History is invoice and
  payment evidence, not a complete usage ledger.
- Dashboard logins are account-specific: `elliot@pollinations.ai` for the
  legacy Pollinations account and `elliot@myceli.ai` for Myceli. The account
  title shown by Cloudflare is not the login-email source of truth.
- The legacy Pollinations account has no credits page. Use its invoices page
  for billing obligations; an unpaid invoice is not prepaid cash or credit.
- The Billable usage view exposes completed billing periods and product-level
  costs before the consolidated invoice appears. The Aug 2026 period was
  2026-07-22 through 2026-08-21; Cloudflare says the invoice can follow within
  24 hours.

Primary evidence sources:

- Invoice/payment: Cloudflare invoice PDFs and billing history.
- Dashboard/usage: Cloudflare dashboard billing and credits pages.
- Legacy Pollinations invoices:
  `https://dash.cloudflare.com/efdcb0933eaac64f27c0b295039b28f2/billing/invoices`.
- API: `GET https://api.cloudflare.com/client/v4/accounts/{account_id}/billing/history?per_page=50`.
  Follow `result_info.next_page`; inspect status and remaining amount. Use the
  deprecated `/user/billing/history` only when the account route is unavailable.
- Transaction context: `economics_bank_ledger` vendor `cloudflare`.

## Daily usage export — verified 2026-09-05

- API: `GET https://api.cloudflare.com/client/v4/accounts/{account_id}/billable-usage?from=YYYY-MM-DD&to=YYYY-MM-DD`.
- Myceli credential: existing `CLOUDFLARE_MYCELI_API_TOKEN`; account ID from
  the vendor journal.
- Query each intersecting billing cycle, including its anchor day. A calendar
  query can silently omit the preceding cycle's days. Myceli anchor: day 22.
  For August, query `2026-07-22`–`2026-08-22` and `2026-08-22`–`2026-09-01`,
  then retain charge periods within `[2026-08-01, 2026-09-01)`.
- Grain: account + subscription + service + charge period (+ zone when present).
  Check duplicates, currency and every calendar day. Sum `ContractedCost`, never
  sum the cumulative columns or add multiple cost measures together.
- Reconcile cycle service totals against the invoice before publishing costs.
  The alpha API currently disagrees with invoiced Durable Objects, Logs and
  Vectorize costs. Complete daily coverage alone does not certify cost accuracy.
- Dashboard: Billable usage → Billing Period. No export control observed;
  period labels are billing cycles. Fixed subscriptions are excluded.
- Invoice PDF: Invoices and documents → exact invoice row → Row actions →
  Download. Usage, credit drawdown, next-cycle subscriptions and subscription
  discounts are separate lines; zero due is not zero usage.
- Credits distinguishes the last invoice-confirmed balance from an estimated
  balance today. Preserve both labels; a current estimated snapshot must say
  that it is estimated. Record the grant expiry and product eligibility caps.
- Re-fetch closed-month daily exports during reconciliation: later exports
  can add records absent from an earlier archive. Compare the completed cycle
  dashboard and daily API separately against the invoice. Do not distribute
  differences across days or treat complete date coverage as certified invoice cost.
- API reference: https://developers.cloudflare.com/api/resources/billing/subresources/usage/methods/get_account_usage_v1/

Collection steps:

1. For invoices, place PDFs in `<collection-dir>/evidence/`.
2. For billing history API evidence, query per account token. Required env vars for the known local accounts:
   - `CLOUDFLARE_POLLINATIONS_BILLING_TOKEN`
   - `CLOUDFLARE_MYCELI_API_TOKEN`

   The token must have access to the Cloudflare user/account billing context being collected. Do not print token values.

   ```bash
   token_name="CLOUDFLARE_POLLINATIONS_BILLING_TOKEN" # or CLOUDFLARE_MYCELI_API_TOKEN
   token_value="$(eval "printf %s \"\${$token_name}\"")"
   test -n "$token_value" || { echo "$token_name missing"; exit 1; }

   curl --fail-with-body --silent --show-error \
     "https://api.cloudflare.com/client/v4/accounts/$account_id/billing/history?per_page=50" \
     -H "Authorization: Bearer $token_value"
   ```

   Save raw JSON to `<collection-dir>/evidence/cloudflare-<account>-<period>-billing-history.json`.

3. Billing history is not period-scoped. Save all pages needed to establish the
   requested period and invoice-list completeness, then filter locally.
4. `GET /accounts/{account_id}/billing/credits` returns
   `confirmed_balance_cents`, `original_amount_cents`, `valid_from`, and
   `valid_to`. Divide cents by 100 and preserve exact expiry timestamps. This
   invoice-confirmed balance differs from the current estimated dashboard
   balance; collect and label the latter for current runway.
5. For a completed billing period whose invoice is not yet available, archive
   the Billable usage view and record its exact total as dashboard evidence.
   Replace or confirm it with the consolidated invoice when issued.
6. Preserve actual usage `start`/`end` (UTC, end-exclusive), not calendar-month
   boundaries substituted from the invoice label. Keep invoice issue date and
   cycle dates separate. Do not add a daily export alongside an existing cycle
   total for the same usage; prepare a reviewed replacement only after reconciliation.
7. Use this skill for saved raw evidence.

Known traps:

- Cloudflare is treated as infrastructure, not model inference.
- Myceli account startup credits can zero invoices before they appear as card billing.
- `/billable-usage/info` verifies the cycle anchor; `/subscriptions` exposes
  fixed list prices and dates. Reconcile actual fixed charges and discounts
  with the invoice before booking them.
- The documented receipts PDF endpoint returned `404` for both receipt and
  invoice IDs. Use dashboard Row actions → Download; a failed route is not
  proof that the invoice is absent.
- Dashboard downloads use a billing-history UUID as the filename. Validate
  the original PDF's account, printed invoice number and service periods
  before renaming it. Cloudflare supplies consolidated invoices rather than
  individual payment receipts.
- A separate startup discount can cancel the full fixed subscription charge.
  Record the net fixed charge separately from metered usage and grant drawdown;
  a fully discounted subscription does not consume the grant.
- A mistaken June 2026 card charge was refunded; do not double count charge and refund as cost.
- The `/user/billing/history` endpoint scopes to the token/account context.
