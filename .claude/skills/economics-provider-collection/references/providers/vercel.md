# Vercel AI Gateway Connector Guide

Canonical vendor: `vercel`

## Verified — 2026-08-21

- Status: the official AI Gateway Custom Reporting API works with the existing
  production gateway key.
- Verify AI Gateway funding in the Pollinations AI team in the
  `elliot@myceli.ai` Chrome window. Historical credit snapshots do not establish
  the current balance; separate purchased credit, promotional grants, and any
  hosting-plan allowance. Record zero only after checking that exact team.
- Report dates are inclusive UTC dates. Each report query is billable, so use
  one bounded query per close and retain the response.

Primary evidence sources:

- API: `GET https://ai-gateway.vercel.sh/v1/report`.
- Dashboard: remaining prepaid credit, top-ups, and invoices.
- Verified billing route (2026-09-05):
  `https://vercel.com/pollinations/~/settings/billing` → AI Gateway Credit.
  Invoices: `https://vercel.com/pollinations/~/settings/invoices` → AI Gateway
  Credits invoice. Confirm the Pollinations AI team and Myceli login.
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
- AI Gateway credit is separate from Pro-plan included infrastructure credit
  and Vercel Agent credit. The billing page states one-year expiry after
  purchase; derive each purchased lot's expiry from its paid invoice date.
  Processing fees and tax do not increase the credit amount.
- Record auto-reload status, threshold, and target without changing them.
  A credit balance is not necessarily a promotional grant.
