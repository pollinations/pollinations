# Vercel AI Gateway Connector Guide

Canonical vendor: `vercel`

## Verified — 2026-08-21

- Status: the official AI Gateway Custom Reporting API works with the existing
  production gateway key.
- AI Gateway usage is funded from prepaid Vercel credit for the current account.
- Report dates are inclusive UTC dates. Each report query is billable, so use
  one bounded query per close and retain the response.

Primary evidence sources:

- API: `GET https://ai-gateway.vercel.sh/v1/report`.
- Dashboard: remaining prepaid credit, top-ups, and invoices.
- Wise/invoice: settled top-up cash and tax.

Collection steps:

1. Query the exact closed month with `start_date`, `end_date`,
   `group_by=model`, and `api_key_id=self`.
2. Store `total_cost`, `market_cost`, `request_count`, and token totals for each
   model as raw evidence.
3. Record provider burn as credit-funded while a dated dashboard balance proves
   prepaid credit remains.
4. Reconcile the official report against OP Pollen and keep any meter difference
   visible rather than replacing the provider total with the internal estimate.
5. Save the raw response in `data/inbox/vercel/` and Google Drive.

Official reference:

- https://vercel.com/docs/ai-gateway/observability-and-spend/custom-reporting

Known traps:

- `total_cost` is the customer cost; `market_cost` is useful for BYOK analysis.
- The local Vercel CLI can be authenticated to an unrelated team and is not
  evidence for this account.
- A report proves usage, not remaining prepaid balance or invoice tax.
