# RunPod Connector Guide

Canonical vendor: `runpod`

## Verified — 2026-07-10

- Status: live GraphQL balance, burn-rate, and pod inventory work.

Use when:

- collecting RunPod GPU billing evidence
- reconciling RunPod invoices, card top-ups, grants, and GPU usage

Primary evidence sources:

- Invoice/payment: RunPod invoice PDFs, receipts, and card/Wise transactions.
- API: RunPod REST billing endpoints for pods, endpoints, and network volumes.
- Dashboard: billing and credit balance screenshots.

Required credential:

- `RUNPOD_API_KEY`

Current snapshot option:

- RunPod GraphQL `myself` can expose `clientBalance`, `currentSpendPerHr`, and
  active pod details. Use it only when the user asks for balance now, current
  burn rate, or a live fleet snapshot.
- Keep the API key out of saved URLs and logs. Save only the bounded response
  needed as evidence.

Known traps:

- REST billing uses separate surfaces: `pods`, `endpoints`, and `networkvolumes`. Sum all relevant surfaces for the month.
- `pods` and `endpoints` use a month key like `time`; `networkvolumes` may use `startDate`.
- The historical GraphQL API is not enough for month ledger evidence; it mostly exposes live balance/current spend.
- Do not recreate the retired month-open balance cache or top-up-reset state.
  GraphQL balance and hourly spend are snapshots, not completed-month costs.
- Grant waterfall matters. A $2,500 credit code was redeemed in March 2026; usage burns credit until exhausted.
- Purchased GPU compute credits are our cash/prepaid balance, not grant. Do not classify purchased credits as free grant usage.
- Invoice PDFs should outrank older roster assumptions when grant/payment status conflicts.

Expected entry:

- `cost_category`: `gpu`
- `op_cloud_type`: `gpu`
- `op_transaction_category`: `cloud` for invoices/top-ups, `null` for pure usage exports
- `should_match_op_transaction`: true for invoices/top-ups, false for pure usage exports
- `should_match_op_cloud`: true
