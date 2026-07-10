# Stripe Connector Guide

Canonical vendor: `stripe`

## Empirical status — 2026-07-10

- Status: bounded payouts API works.
- June returned one payout totaling EUR 9,105.05 and no next page.
- This is June bank-settlement evidence, not necessarily revenue earned in June.

Use when:

- reconciling a Stripe payout received in Wise with the transactions it settles
- checking bounded Stripe balance activity as evidence for a runway assumption
- distinguishing operating Stripe cash from a separately evidenced investment

Primary evidence sources:

- Cash truth: Wise activity or `op_transactions` on the bank settlement date.
- Payouts API: `GET https://api.stripe.com/v1/payouts`.
- Payout contents: `GET https://api.stripe.com/v1/balance_transactions?payout=<po_id>` for an automatic payout.
- Balance activity: bounded `GET https://api.stripe.com/v1/balance_transactions`.
- Dashboard/report: Stripe payout reconciliation report for an automatic payout.

Required credential:

- `STRIPE_API_KEY`

Collection steps:

1. Bound the requested period with Unix timestamps. Do not fetch all history.
2. List payouts and save the raw response to
   `data/inbox/stripe-<period>-payouts.json`.
3. When the question is what a specific automatic payout contains, query its
   balance transactions by payout ID and save the raw response separately.
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

Treasury use:

- Stripe payout cash belongs in `op_transactions`, category `revenue`, and
  should reconcile to Wise.
- Stripe balance activity is supporting evidence for reconciliation or an
  explicit `op_runway` assumption. Do not write it to `op_cloud`.
- Until Treasury has a dedicated earned-revenue ledger, do not replace Wise
  cash rows with Stripe activity-month totals.

Official references:

- https://docs.stripe.com/payouts/reconciliation
- https://docs.stripe.com/reports/payout-reconciliation
