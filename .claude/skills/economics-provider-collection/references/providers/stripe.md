# Stripe Connector Guide

Canonical vendor: `stripe`

## Verified — 2026-07-10

- Status: bounded payouts API works.

Primary evidence sources:

- Cash truth: Wise activity or `economics_bank_ledger` on the bank settlement date.
- Payouts API: `GET https://api.stripe.com/v1/payouts`.
- Payout contents: `GET https://api.stripe.com/v1/balance_transactions?payout=<po_id>` for an automatic payout.
- Balance activity: bounded `GET https://api.stripe.com/v1/balance_transactions`.
- Dashboard/report: Stripe payout reconciliation report for an automatic payout.

Account identity:

- Stripe account ID is part of the evidence contract. Do not infer the account
  from a bank description such as `STRIPE`.
- Use one API key and one export per Stripe account. Never combine pagination
  across accounts.
- Record the authenticated account ID and display name alongside the payout and
  its balance transactions.

Required credential:

- `STRIPE_API_KEY`

Collection steps:

1. Bound the requested period with Unix timestamps. Do not fetch all history.
2. List payouts and save the raw response to
   `data/inbox/stripe-<period>-payouts.json`.
3. When the question is what a specific automatic payout contains, query its
   balance transactions by payout ID and save the raw response separately.
   Follow `has_more` and `starting_after` until every page is saved, then require
   the contained balance-transaction net to equal the payout amount exactly.
   Confirm the authenticated Stripe account ID is the intended account before
   using the export as evidence.
4. When the question is activity during a calendar month, query balance
   transactions by `created[gte]` and exclusive `created[lt]`. Sum `net` only
   after filtering to the requested question; Stripe monetary fields are minor
   currency units.
5. Preserve currency. Do not assume the account or every transaction is EUR.

Known traps:

- A payout is a bank transfer, not the month in which revenue was earned. Keep
  it on its Wise settlement date in cash runway calculations.
- Automatic payouts can be reconciled to their settlement batch. Stripe cannot
  identify the exact transaction set for user-controlled instant or manual
  payouts; report that limitation instead of guessing.
- Do not count payout-type balance transactions as operating activity when
  summing charges, refunds, fees, disputes, or adjustments.
- Do not copy the retired sheet's payout-shifting mechanism. It deliberately
  moved cash between months and broke bank reconciliation.
- A large Stripe-looking inflow is not automatically an investment. Require
  separate financing evidence before using canonical vendor `investment`.
- One company can have multiple Stripe accounts with indistinguishable Wise
  descriptions. A payout amount match is insufficient without the Stripe
  account ID embedded in the source export.

Economics use:

- Stripe payout cash belongs in `economics_bank_ledger`, category `revenue`, and
  should reconcile to Wise.
- Stripe balance activity is supporting evidence for reconciliation. Do not
  write it to `economics_compute_ledger`; Runway derives its revenue projection from verified
  bank history.
- Until Economics has a dedicated earned-revenue ledger, do not replace Wise
  cash rows with Stripe activity-month totals.

Official references:

- https://docs.stripe.com/payouts/reconciliation
- https://docs.stripe.com/reports/payout-reconciliation
