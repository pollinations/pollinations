# Alibaba Connector Guide

Canonical vendor: `alibaba`

## Verified — 2026-09-04

- Status: working provider billing API through the `aliyun` CLI.
- Login: `elliot@myceli.ai` in the Myceli browser workspace.
- Managed account: Myceli.AI OÜ (`5314153712077332`).
- Billing account: `10451809460254` (alias of the managed account).
- Balance: `0.00 USD`.
- The current month remains partial and must not be used as a closed-month
  forecast baseline.

Primary evidence sources:

- CLI: `aliyun bssopenapi QueryInstanceBill --BillingCycle <YYYY-MM> --Granularity MONTHLY --IsBillingItem true --IsHideZeroCharge true --PageSize 300 -p pollinations-finops`
- Summary fallback: `aliyun bssopenapi QueryBillOverview --BillingCycle <YYYY-MM> -p pollinations-finops`
- Archived 2026 billing-item history: https://drive.google.com/file/d/1ImP3PS7o4eeq6BZapWElDJ3KUnsVY0PR/view?usp=drivesdk
- 2026 provider/Pollen reconciliation: https://drive.google.com/file/d/1G8HF_KyAhBgwBUUnnCQ426eLiGwqKSJk/view?usp=drivesdk
- Invoice/payment: Alibaba Cloud invoice, billing email, or Wise/card transaction.
- Dashboard: <https://billing-cost.console.alibabacloud.com/fortune/billing-account>
  for balance and bill cross-checks.

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
6. Use this skill for saved raw evidence.

Known traps:

- Alibaba PayAsYouGo has no meaningful standing credit pool for this workflow.
- Use `PretaxAmount` as the net paid amount. Do not use
  `PretaxGrossAmount` as cash cost.
- The CLI profile is the auth source; do not put access keys in command arguments or saved evidence.
- Current-month bill overview is live and may change until the month closes.
