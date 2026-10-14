# DeepInfra Connector Guide

Canonical vendor: `deepinfra`

## Verified — 2026-08-20

- Status: usage and current-balance APIs work.
- The account endpoint exposed the current Stripe-balance field.
- The `initial_month` label can lag; trust the explicit epoch bounds and
  item interval rather than that lagging label.
- The endpoint returns exact item rows with model, task, units, rate, pricing
  type, and cost. Item and `total_cost` values are cents.

Primary evidence sources:

- API: `GET https://api.deepinfra.com/payment/usage?from=<epoch>&to=<epoch>`
- Current balance snapshot: `GET https://api.deepinfra.com/v1/me?checklist=true`
- Dashboard/usage: DeepInfra billing or usage screenshots/exports when API access is unavailable.
- Transaction context: `economics_bank_ledger` only for top-ups or payments, not pure usage exports.

Required credential:

- `DEEPINFRA_API_KEY`, sent as `Authorization: Bearer <token>`.

Known traps:

- The API expects epoch-second `from` and `to` values. Date strings can silently return empty results.
- `total_cost` is reported in cents. Divide by 100 before treating it as USD.
- Verify the cents-to-USD conversion by recomputing item units × rates.
- The returned `period` label can lag the bounded item interval by one month.
  Trust the explicit query bounds and item timestamps, and record the mismatch.
- Older queries can be partial even with HTTP 200. Compare coverage against
  retained evidence; do not overwrite stronger historical totals with a
  truncated response.
- Bound the window to the requested month. For a current-month check, cap `to` at now so the query does not extend into the future.
- `checklist.stripe_balance` is useful as a balance-now snapshot only. Do not
  derive historical monthly burn from successive snapshots unless the user
  explicitly asks for an estimate.
- Treat API usage as cloud/inference evidence. Do not force a cash transaction match unless the source is a payment, receipt, or top-up.
