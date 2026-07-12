# Alibaba Connector Guide

Canonical vendor: `alibaba`

## Empirical status — 2026-07-10

- Status: working provider billing API through the `aliyun` CLI.
- June 2026 returned four bill-overview rows across Alibaba Cloud Model
  Studio and Object Storage Service.
- Sum of `PretaxAmount`: USD 606.70.
- The current month remains partial and must not be used as a closed-month
  forecast baseline.

Use when:

- collecting Alibaba Cloud monthly bill overview evidence
- reconciling Alibaba Cloud charges, discounts, coupons, and usage cost
- filling/checking `op_cloud` infrastructure or inference rows

Primary evidence sources:

- CLI: `aliyun bssopenapi QueryBillOverview --BillingCycle <YYYY-MM> -p pollinations-finops`
- Invoice/payment: Alibaba Cloud invoice, billing email, or Wise/card transaction.
- Dashboard: Alibaba Cloud billing console for cross-checking bill overview rows.

Required local setup:

- `aliyun` CLI installed.
- Local CLI profile `pollinations-finops`.
- Optional SOPS keys: `ALIBABA_CLOUD_ACCESS_KEY_ID`, `ALIBABA_CLOUD_ACCESS_KEY_SECRET`, `ALIBABA_CLOUD_REGION`.

Live validation:

- Read-only CLI call tested on 2026-07-10.
- June 2026 normalized to one CLI meter row from four bill-overview rows, source `cli`, currency `USD`, paid total `606.70`.
- July 2026 partial returned one CLI meter row, source `cli`, currency `USD`, paid total `1.80`.

Collection steps:

1. Query the requested billing cycle:

   ```bash
   aliyun bssopenapi QueryBillOverview \
     --BillingCycle <YYYY-MM> \
     -p pollinations-finops
   ```

   Save raw JSON to `data/inbox/alibaba-<period>-bill-overview.json`.

2. Sum `Data.Items.Item[].PretaxAmount` for net paid cost.
3. Keep product/service rows in `cost_details` when extracting; they are the useful detail for provider reconciliation.
4. Treat discounts and coupons as lower net cost unless a separate invoice or accounting decision says to book them as credit.
5. For cash reconciliation, pair Alibaba bill overview with Wise/card transactions or invoice PDFs.
6. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

Expected entry:

- `cost_category`: `infrastructure`, `model`, or `inference_serverless` depending on product rows
- `op_cloud_type`: `infra` unless the product rows clearly indicate inference/model spend
- `op_transaction_category`: `cloud` for invoices/card charges, `null` for pure bill overview usage evidence
- `should_match_op_transaction`: true for invoice/payment evidence, false for pure CLI usage evidence
- `should_match_op_cloud`: true for bill overview usage evidence

Known traps:

- Alibaba PayAsYouGo has no meaningful standing credit pool for this workflow.
- Use `PretaxAmount` as the net paid amount. Do not use `PretaxGrossAmount` unless you are explicitly analyzing gross before discounts/coupons.
- The CLI profile is the auth source; do not put access keys in command arguments or saved evidence.
- Current-month bill overview is live and may change until the month closes.

Reconciliation notes:

- CLI bill overview explains provider usage/cost.
- Wise/card transactions explain cash movement.
- Small differences between net bill overview and card transactions can be FX or timing noise.
