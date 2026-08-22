# Lambda Cloud Connector Guide

Canonical vendor: `lambda`

## Verified — 2026-08-20

- Status: live resource inventory and price-book APIs work. The Cloud API still
  does not expose historical billing, but the authenticated workspace Usage
  dashboard exposes complete calendar-month history by instance, instance type,
  region, duration, hours, rate, and spend.

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
- Historical usage dashboard:
  `https://cloud.lambda.ai/workspace/<workspace-id>/usage`. Collect the
  Instances, Filesystems, and Users tabs; Instances is the detailed cost source.
- Grant and cash settlement: `https://cloud.lambda.ai/account/billing`. Preserve
  weekly credit applications and payment invoices separately from calendar-month
  usage.
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
- Usage-dashboard spend is calendar-month gross usage. Lambda invoices and
  service-credit applications are weekly, so invoice dates must not determine
  the usage month.
- If dashboard gross usage differs from grant-plus-cash settlement, keep the
  provider-native detail and add one explicit settlement adjustment. Do not hide
  the difference inside a model row.
- A named instance can serve several models. Keep the shared model list on the
  resource row until internal usage supplies a defensible allocation weight.

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
