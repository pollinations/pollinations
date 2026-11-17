# Regolo.ai Connector Guide

Canonical vendor: `regolo`

## Verified — 2026-09-04

- Account: `thomash@pollinations.ai`
- Browser workspace: Myceli (`elliot@myceli.ai` Google profile).
- Subscription: <https://dashboard.regolo.ai/subscriptions>
- Usage: <https://dashboard.regolo.ai/usage>
- Collection method: dashboard
- Billing currency: EUR
- The Partner Program is a free, unlimited trial with no charge.

Collection steps:

1. Open the subscription page in the Myceli browser workspace.
   Authenticate as `thomash@pollinations.ai`; do not use the Thomas or
   Pollinations browser workspaces.
2. Record the remaining trial days as a non-monetary `usage-quota` balance
   only when displayed. On October 6 the Partner Program remains active,
   but Subscription shows available paid plans without a trial countdown;
   keep expiry unknown rather than carrying an old countdown forward.
3. Open the usage page and select the complete calendar month.
4. Preserve model-level usage when the dashboard exposes it.
5. Record provider usage as credit-funded while the Partner Program remains
   active; keep invoices separate if billing starts later.
6. Open account menu → Billing, capture Payments and Invoices, and download
   every available original relevant to reconciliation. Billing is
   <https://dashboard.regolo.ai/billing>. Distinguish prepaid payments from
   usage in the selected month; an older payment invoice does not establish
   that month's usage.

Known traps:

- The trial has no numeric wallet balance. Do not invent a monetary credit.
- Dashboard usage costs are informational and are not billed during the trial.
- Selecting dates can leave the picker open while data loads. Confirm the
  final period and loaded totals before saving evidence. Choosing an
  outside-month date can shift the displayed calendars; inspect them again
  before selecting the end date.
- When timezone is omitted and usage is zero, capture an adjacent-day buffer
  around the month. Zero requests, tokens and cost throughout that superset
  establishes UTC-month zero; nonzero activity requires explicit timestamps.
- Search original invoices under SEEWEB S.R.L. / seeweb.it as well as Regolo.
  Match prepaid PayPal identifiers to Payments, separately from usage dates.
  An empty current invoice list does not invalidate an archived original.
- If a pricing or terms notice blocks collection, read it and obtain
  action-time confirmation before accepting binding changes. Previously
  accepted notices require no repeated approval. Do not subscribe to a paid
  plan while collecting evidence.
