# RunPod Connector Guide

Canonical vendor: `runpod`

## Verified — 2026-08-20

- Status: the REST billing API returns the complete available account history
  for Pods, Serverless endpoints, and network volumes. The current account's
  first returned activity is 2026-03-25.

Use when:

- collecting RunPod GPU billing evidence
- reconciling RunPod invoices, card top-ups, grants, and GPU usage

Primary evidence sources:

- Invoice/payment: RunPod invoice PDFs, receipts, and card/Wise transactions.
- API: RunPod REST billing endpoints for pods, endpoints, and network volumes.
- Dashboard: billing and credit balance screenshots.

Full-history collection:

```bash
curl -sS "https://rest.runpod.io/v1/billing/pods?bucketSize=month&grouping=podId&startTime=<RFC3339>&endTime=<RFC3339>" \
  -H "Authorization: Bearer $RUNPOD_API_KEY"
curl -sS "https://rest.runpod.io/v1/billing/endpoints?bucketSize=month&grouping=endpointId&startTime=<RFC3339>&endTime=<RFC3339>" \
  -H "Authorization: Bearer $RUNPOD_API_KEY"
curl -sS "https://rest.runpod.io/v1/billing/networkvolumes?bucketSize=month&startTime=<RFC3339>&endTime=<RFC3339>" \
  -H "Authorization: Bearer $RUNPOD_API_KEY"
```

Use daily buckets for an exact chronological grant waterfall. Query Pods and
endpoints again grouped by `gpuTypeId` when GPU-family totals are useful.

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
- Monthly billing rows preserve deleted resource IDs but do not expose deleted
  resource names or a Pod-to-model map. Reuse an already evidenced resource map;
  otherwise leave the model unallocated.
- The monthly API can omit the running month. Query the running month with daily
  buckets and record zero only when all three billing surfaces return no rows.

Expected entry:

- `cost_category`: `gpu`
- `op_cloud_type`: `gpu`
- `op_transaction_category`: `cloud` for invoices/top-ups, `null` for pure usage exports
- `should_match_op_transaction`: true for invoices/top-ups, false for pure usage exports
- `should_match_op_cloud`: true
