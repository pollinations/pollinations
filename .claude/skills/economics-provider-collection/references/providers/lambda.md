# Lambda Cloud Connector Guide

Canonical vendor: `lambda`

## Verified — 2026-08-20

- Status: live resource inventory and price-book APIs work. The Cloud API still
  does not expose historical billing, but the authenticated workspace Usage
  dashboard exposes complete calendar-month history by instance, instance type,
  region, duration, hours, rate, and spend.

## Verified — 2026-09-06

- Weekly invoices arrive by email from `Lambda <no-reply@lambdal.com>` with
  the subject "Here is your invoice" and one PDF attachment named
  `invoice-lambda_<MMYYYY><seq>.pdf`. Collect them with
  `gog gmail search 'from:(lambda) invoice after:YYYY/MM/DD before:YYYY/MM/DD' --json`,
  then `gog gmail get <id> --json` and
  `gog gmail attachment <messageId> <attachmentId> --json`.
- Each PDF states `Billing Period` (Monday to Monday), `Sub Total`,
  `Promotional Credits`, and `Amount Due (USD)`. The usage month is the
  calendar month of the dashboard rows, never the invoice week.
- Billing page: `https://cloud.lambda.ai/billing` (Credits table with the
  grant, Credit activity per invoice, Payment History with a `View` link per
  invoice). Grant `451fc717`: $7,500 granted 2026-03-30, expired 2026-08-15
  with $0.00 remaining.
- Reconciliation done 2026-09-06: the 18 weekly invoices from
  `lambda_04202614208` (Mar 30 – Apr 6) to `lambda_08202613480`
  (Jul 27 – Aug 3) sum to $7,509.56 = $7,500.00 promotional credit + $9.56
  card. The staging ledger's calendar-month rows (Mar – Aug 2026) sum to
  $7,508.48 (credit burn $7,495.04 + paid $13.44). Per-month differences are
  the weekly-versus-monthly grain, not missing usage.
- Archive: all 18 invoices are in the accounting Drive under
  `2026/<MM Month>/Invoices` as `YYYY-MM-DD__Lambda__invoice-lambda-<id>.pdf`
  (invoice date).

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
- Cash context: Wise or `economics_bank_ledger` when a payment is made.

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
