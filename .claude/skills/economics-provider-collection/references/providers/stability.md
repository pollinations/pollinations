# Stability AI Connector Guide

Canonical vendor: `stability`

## Verified — 2026-08-21

- Status: active provider for the direct `stable-audio-3-large` route.
- No dedicated billing API credential or complete monthly usage export has
  been verified; use the dashboard and archived purchase evidence.
- Until a provider export is available, use the Stability billing dashboard and
  the internal Pollen meter together; never infer provider burn only from the
  prepaid balance.

Primary evidence sources:

- Dashboard: Stability account billing, usage and remaining credits.
- Internal meter: OP Pollen rows for provider `stability` and model
  `stable-audio-3-large`.
- Payment: Stability receipts and Wise/card transactions.

Collection steps:

1. Check the signed-in account identity, then Billing → Credits for the
   current balance and payment list. As checked October 2026, this page has
   no monthly usage selector or export; do not infer September burn from its
   current credits.
2. Download a usage export if another verified account page offers one;
   otherwise retain the missing provider-usage gap and capture the account
   and credit pages.
3. Save the export or screenshot under `<collection-dir>/evidence/stability/` and archive it in
   Drive before proposing ledger rows.
4. Compare the provider month to OP Pollen for `stable-audio-3-large`.
5. Keep prepaid credit purchases separate from usage consumption.

Known traps:

- `stable-audio-3-medium` is billed by canonical provider `fal`, not Stability.
- A credit purchase proves funding, not usage in the purchase month.
- A current credit balance alone cannot reconstruct historical monthly burn.
