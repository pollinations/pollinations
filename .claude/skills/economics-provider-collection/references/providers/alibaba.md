# Alibaba Connector Guide

Canonical vendor: `alibaba`

## Verified — 2026-08-21

- Status: working provider billing API through the `aliyun` CLI.
- Account: Myceli.AI OÜ (`5314153712077332`).
- The current month remains partial and must not be used as a closed-month
  forecast baseline.

Use when:

- collecting Alibaba Cloud monthly billing-item and model evidence
- reconciling Alibaba Cloud charges, discounts, coupons, and usage cost
- filling/checking `economics_compute_ledger` infrastructure or inference rows

Primary evidence sources:

- CLI: `aliyun bssopenapi QueryInstanceBill --BillingCycle <YYYY-MM> --Granularity MONTHLY --IsBillingItem true --IsHideZeroCharge true --PageSize 300 -p pollinations-finops`
- Summary fallback: `aliyun bssopenapi QueryBillOverview --BillingCycle <YYYY-MM> -p pollinations-finops`
- Archived 2026 billing-item history: https://drive.google.com/file/d/1ImP3PS7o4eeq6BZapWElDJ3KUnsVY0PR/view?usp=drivesdk
- 2026 provider/Pollen reconciliation: https://drive.google.com/file/d/1G8HF_KyAhBgwBUUnnCQ426eLiGwqKSJk/view?usp=drivesdk
- Invoice/payment: Alibaba Cloud invoice, billing email, or Wise/card transaction.
- Dashboard: Alibaba Cloud billing console for cross-checking bill overview rows.

Required local setup:

- `aliyun` CLI installed.
- Local CLI profile `pollinations-finops`.
- Optional SOPS keys: `ALIBABA_CLOUD_ACCESS_KEY_ID`, `ALIBABA_CLOUD_ACCESS_KEY_SECRET`, `ALIBABA_CLOUD_REGION`.

Live validation:

- Read-only CLI call tested on 2026-07-10.
- A billing cycle's bill-overview rows normalize to one CLI meter row, source `cli`, currency `USD`.

Collection steps:

1. Query the requested billing cycle at billing-item grain:

   ```bash
   aliyun bssopenapi QueryInstanceBill \
     --BillingCycle <YYYY-MM> \
     --Granularity MONTHLY \
     --IsBillingItem true \
     --IsHideZeroCharge true \
     --PageSize 300 \
     -p pollinations-finops
   ```

   Follow `NextToken` if present. Save every raw page to
   `data/inbox/alibaba/alibaba-<period>-instance-bill-items-page-<n>.json`.

2. Sum `Data.Items.Item[].PretaxAmount` for net paid cost.
3. Keep billing-item rows rather than collapsing them to one provider total.
   For Alibaba Cloud Model Studio rows, `InstanceID` contains semicolon-separated
   identifiers and the third segment is the model name. Preserve it as `model`.
4. Book `PretaxAmount` as cash cost. Book `DeductedByCoupons` as
   provider-funded usage, with equal credit burn and funding-award rows.
   `InvoiceDiscount` is the negotiated effective price and is not a grant.
   Keep `DeductedByResourcePackage` as metadata unless it demonstrably reduces
   `PretaxAmount`.
5. For cash reconciliation, pair Alibaba bill overview with Wise/card transactions or invoice PDFs.
6. Use `agent.system.txt` with `mode: extract` for saved raw evidence.
7. Run `ingest/scripts/alibaba-2026-reconcile.mjs` before publishing a reviewed
   historical correction.

Expected entry:

- `cost_category`: `infrastructure`, `model`, or `inference_serverless` depending on product rows
- `op_cloud_type`: `infra` unless the product rows clearly indicate inference/model spend
- `op_transaction_category`: `cloud` for invoices/card charges, `null` for pure bill overview usage evidence
- `should_match_op_transaction`: true for invoice/payment evidence, false for pure CLI usage evidence
- `should_match_op_cloud`: true for bill overview usage evidence

Known traps:

- Alibaba PayAsYouGo has no meaningful standing credit pool for this workflow.
- Use `PretaxAmount` as the net paid amount. Do not use
  `PretaxGrossAmount` as cash cost.
- The CLI profile is the auth source; do not put access keys in command arguments or saved evidence.
- Current-month bill overview is live and may change until the month closes.

Reconciliation notes:

- `QueryInstanceBill` explains provider usage/cost and model attribution.
- `QueryBillOverview` is only a monthly-total cross-check when the detailed call
  is unavailable.
- Wise/card transactions explain cash movement.
- Small differences between net bill overview and card transactions can be FX or timing noise.
- February, March, May, and June 2026 contain explained historical
  provider-versus-Pollen drift. Preserve both source ledgers; the missing cost
  cannot be assigned safely to Paid versus Quest.
