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
- Live accounts: `acct_1SrY3q7rcjS3l7tr` → `pollen`;
  `acct_1QzdqWGHtmCJlpeq` → `kofi`. Verify identities before each collection.
  The Stripe MCP can read both with explicit `stripe_context` and `livemode: true`.

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
   MCP `GetBalanceTransactions` parameters must use nested
   `created: {gte: <start>, lt: <end>}`; flat bracket keys were ignored.
   Assert every returned timestamp is in range, IDs are unique, and the final
   page has `has_more: false`. Archive one raw export per account immediately.
5. Preserve currency. Do not assume the account or every transaction is EUR.
6. P&L grain: account, UTC month, settlement currency. Use `reporting_category`:
   `charge` → gross; `refund` → refunds; `charge_failure`/`dispute` → reversals;
   `fee` → standalone fees. Include embedded `fee` once (also on reversals and
   FX), including Ko-fi application fees. Exclude payouts and FX principal.
   Reconcile net to included source transactions in integer minor units.
   Stop on an unreviewed category; never silently omit it.

Known traps:

- A payout is a bank transfer, not the month in which revenue was earned. Keep
  it on its Wise settlement date in cash runway calculations.
- Do not use webhook purchase currency for P&L. Adaptive Pricing and account
  settlement-currency changes can make it differ from balance activity.
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
- Reviewed account-month-currency sales belong in `economics_stripe_sales`.
  Reuse `stripe:<account_id>:<month>:<currency>` as `entry_id` for updates.
- Set `revenue_stream` to `pollen` or `kofi` from the verified account identity.
- Set `coverage_end` to the verified exclusive UTC export boundary and
  `expected_accounts` to the required account count for that month. Record zero
  activity explicitly; a missing account/export is not a zero. Forecasts require
  complete coverage for every required account through the following month start.
- Runway P&L separates Pollen/Ko-fi gross sales, refunds, and reversals. Fees
  belong in Operations. Cash change and balance continue to use Wise payouts.
- Do not write Stripe activity to `economics_compute_ledger`.

Official references:

- https://docs.stripe.com/payouts/reconciliation
- https://docs.stripe.com/reports/payout-reconciliation
