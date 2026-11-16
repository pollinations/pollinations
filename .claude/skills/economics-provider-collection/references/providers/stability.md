# Stability AI Connector Guide

Canonical vendor: `stability`

## Verified — 2026-08-21

- Status: active provider for the direct `stable-audio-3-large` route.
- The existing runtime `STABILITY_API_KEY` supports documented read-only
  `GET https://api.stability.ai/v1/user/account` and `/v1/user/balance`
  (verified November 3, 2026). Verify email and default organization first;
  an `Organization` header scopes an explicitly selected organization.
- Balance is aggregate credits at 100 credits/USD; it does not establish the
  paid/promotional split, expiry or calendar-month burn. No complete monthly
  usage endpoint was found in the official reference.
- Until a provider export is available, use the Stability billing dashboard and
  the internal Pollen meter together; never infer provider burn only from the
  prepaid balance.

Primary evidence sources:

- Dashboard: <https://platform.stability.ai/dashboard/billing>; identity at
  `/dashboard/account`. The legacy account route redirects to this redesign.
- Internal meter: OP Pollen rows for provider `stability` and model
  `stable-audio-3-large`.
- Payment: Stability receipts and Wise/card transactions.

Collection steps:

1. Verify account identity, then Billing for credits and the complete Charges
   table. As checked November 2026, Account and Billing expose no monthly usage
   export, funding split, expiry or supplier-document links. Keep originals
   from the archive and email; never infer monthly burn from current credits.
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
- Official documentation now redirects to `docs.stability.ai`. A current price
  needs an effective date before it can explain historical billing.
- Normal sign-in uses the official `/api/auth/login` → WorkOS AuthKit flow,
  returning to `/api/auth/callback`. Verify the provider-owned redirect chain
  and use the existing account rather than creating another one.
