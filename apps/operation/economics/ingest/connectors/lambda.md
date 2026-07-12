# Lambda Cloud Connector Guide

Canonical vendor: `lambda`

## Empirical status — 2026-07-10

- Status: live resource inventory and price-book APIs work; historical billing
  remains unavailable.
- The API returned one instance and it was active. The price book returned
  25 instance types.
- This proves the current fleet shape only. It cannot establish June runtime
  hours or a closed-month invoice.

Use when:

- collecting a current snapshot of active Lambda Cloud instances
- estimating the instantaneous GPU burn rate for an operator review
- reconciling Lambda invoices or manually witnessed GPU periods to `op_cloud`

Primary evidence sources:

- Current instances: `GET https://cloud.lambda.ai/api/v1/instances`.
- Instance types and current prices: the Lambda Cloud API instance-type
  endpoint or console pricing visible at collection time.
- Completed cost: Lambda invoice, receipt, dashboard/export, or an explicitly
  reviewed manual calculation.
- Cash context: Wise or `op_transactions` when a payment is made.

Required credential:

- `LAMBDA_LABS_API_KEY`

Authentication:

```bash
curl -sS "https://cloud.lambda.ai/api/v1/instances" \
  -H "Authorization: Bearer $LAMBDA_LABS_API_KEY" \
  -H "accept: application/json"
```

Collection steps:

1. Save the raw instance response to
   `data/inbox/lambda-instances-<timestamp>.json`.
2. Keep only instances whose returned status means they are actively running
   when calculating the instantaneous burn rate.
3. Join each instance to a price witnessed at the same collection time. Record
   instance ID, name, type/GPU, status, unit price, source, and timestamp.
4. Sum active hourly prices only for a current snapshot. Label daily or monthly
   values as extrapolations, not invoices.

Known traps:

- The instance endpoint is operational inventory, not a billing ledger. It
  does not prove how many hours an instance ran earlier in the month.
- Do not reproduce the retired stateful daily integration of sampled burn rate.
  Starts and stops between samples create drift, and there is no need for a
  persistent cache in the agent-driven Economics workflow.
- Do not assume a price embedded in retired local state is still current.
- Historical invoices or detailed usage evidence outrank a current instance
  snapshot.

Expected Economics use:

- `cost_category`: `gpu`
- `op_cloud_type`: `gpu`
- `op_transaction_category`: `cloud` for an invoice/payment, otherwise `null`
- `should_match_op_transaction`: true for invoice/payment evidence, false for
  a pure instance snapshot
- `should_match_op_cloud`: true only when the evidence supports a bounded cost
  period; otherwise keep the snapshot as review evidence

Official reference:

- https://docs.lambda.ai/public-cloud/cloud-api/
