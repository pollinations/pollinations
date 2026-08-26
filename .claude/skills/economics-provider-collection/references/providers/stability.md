# Stability AI Connector Guide

Canonical vendor: `stability`

## Verified — 2026-08-21

- Status: active provider for the direct `stable-audio-3-large` route.
- Economics has invoice/payment evidence for the initial USD 30 purchase but no
  dedicated billing API credential or complete monthly usage export yet.
- Until a provider export is available, use the Stability billing dashboard and
  the internal Pollen meter together; never infer provider burn only from the
  prepaid balance.

Use when:

- collecting direct Stability API usage or credit-balance evidence
- reconciling `stable-audio-3-large` provider cost against internal usage
- checking whether another credit purchase created a Wise/card transaction

Primary evidence sources:

- Dashboard: Stability account billing, usage and remaining credits.
- Internal meter: OP Pollen rows for provider `stability` and model
  `stable-audio-3-large`.
- Payment: Stability receipts and Wise/card transactions.

Collection steps:

1. Select the full calendar month in the Stability billing dashboard.
2. Download a usage export when offered; otherwise capture the dated usage and
   remaining-credit view.
3. Save the export or screenshot under `data/inbox/stability/` and archive it in
   Drive before proposing ledger rows.
4. Compare the provider month to OP Pollen for `stable-audio-3-large`.
5. Keep prepaid credit purchases separate from usage consumption.

Expected entry:

- `cost_category`: `model`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `cloud` for purchases; `null` for usage evidence
- `should_match_op_transaction`: true for purchases, false for pure usage
- `should_match_op_cloud`: true for usage and credit consumption

Known traps:

- `stable-audio-3-medium` is billed by canonical provider `fal`, not Stability.
- The USD 30 transaction on 2026-06-23 proves a purchase, not June usage.
- A current credit balance alone cannot reconstruct historical monthly burn.
