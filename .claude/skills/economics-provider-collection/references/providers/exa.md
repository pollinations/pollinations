# Exa Connector Guide

Canonical vendor: `exa` — category `infrastructure` (search API, not
model inference): usage rows use `type: infra`.

## Verified — 2026-08-26

- Account: `elliot@myceli.ai`
- Billing: <https://dashboard.exa.ai/billing>
- Usage: <https://dashboard.exa.ai/usage>
- Collection method: dashboard
- Billing currency: USD
- The visible balance is promotional credit, not prepaid cash.
- Usage Volume uses UTC; Spend uses Pacific time. Verify the displayed timezone
  and keep these periods separate.

## Verified — 2026-09-06

- The balance is made of expiring lots. On the billing page, the clock button
  next to "Remaining Balance" opens the "View expiring credits" dialog, which
  lists each lot with its amount and expiry date ("Credits expiring soonest
  are used first"). The Free tier's monthly credit renews on the 1st, and a
  promotional grant has a much later expiry.
- Record one `balance` row per lot with the same `start`, `resource_sku`
  `current-balance-lot`, `resource_id` `lot-<expiry>`, and the expiry in `end`;
  the app merges them into one snapshot and consumes the earliest lot first.
  First check that the displayed lots sum to the header balance. If they do
  not, preserve the unlisted residual as an explicit funding/expiry gap rather
  than assigning it to a displayed lot or adding an account-total row that
  would double-count credit.
- With promotional credits funding the invoice and no cash due, record usage
  as credit-funded (`credit` negative, `paid` 0). Verify final Orb invoices;
  an earlier empty Exa invoice list is not evidence that no invoice exists.
- Use the visible Usage date controls and verify the applied label. The
  redesigned page ignores the old URL range and spend query parameters.
- Evidence archive: `Exa-credit-lots-2026-09-06.json` in the Drive
  "Supporting Evidence" folder.

Collection steps:

1. Open the billing page in the `myceli.ai` browser workspace.
2. Record the remaining balance as provider credit and the exact check time.
3. Select the complete calendar month in Usage Volume and verify UTC coverage.
   Spend and Orb invoices use Pacific billing periods. For UTC costs, retain
   the precise final invoice and all source-recorded request costs in the
   differing boundary windows; never prorate the monthly total.
4. Save any available usage export separately from the balance snapshot.
5. Download original Orb invoices and receipts, including zero-due documents.

Known traps:

- The signed-in team switcher can say `Thomas Haferlach's Personal` under
  `elliot@myceli.ai`; the user confirmed this is the authorized business team
  for Economics on 2026-10-02. Verify both before collection.
- The expiring-lots dialog did not account for the full balance at the latest
  check. Do not assume it lists every active credit or invent an expiry for
  the residual.
- Do not classify the promotional balance as prepaid cash.
- A balance snapshot is not monthly usage evidence.
- The Team Management API supports
  `GET https://admin-api.exa.ai/team-management/api-keys/{publicId}/usage`
  with ISO `start_date`/`end_date`, returning `total_cost_usd` and a breakdown.
  It requires a service key; the existing application key returned `401`.
  Use the dashboard when no approved service key exists. `group_by` is
  documented as having no effect.
- Admin responses can place a reusable secret in `api_key_id` for compatibility.
  Remove that field from exports and output; use stable `id`/`publicId` identity.
- Monthly free credits reset to $10 on the first without rollover; the separate
  onboarding bonus is non-expiring. Identify the actual block before applying
  either general rule to an unlabelled historical balance.
- No activity was visible for August 19–26 at verification time.

## Verified — 2026-10-14

- Billing → Invoices → View all opens the account's private Orb portal.
  **View credit block detail** shows individual blocks, original and remaining
  amounts, effective dates and expiry dates, including future allocations.
- Archive the visible credit table without its signed portal URL. Exclude
  future allocations from current available balances. A dash in the expiry
  column alone is not verified non-expiring terms. Preserve discrepancies
  between the Exa expiry popup and Orb's date display for clarification.
- Inspect Orb's final invoice history after close even if Exa shows no invoices.
  A draft's full cycle label can still contain partial usage and is not final.
- The original PDF exposes detailed usage quantities and credit amounts that
  the portal can group beneath a zero cash total. Use the PDF's precision.
- Requests supports custom ranges and 50-row Load more pagination. Collect a
  boundary superset across all keys, sources and statuses, retaining only
  financial fields. Include rendered table rows with blank request IDs; those
  rows are absent from the clickable-row list. Verify terminal row counts,
  preserve blank costs and never assign guessed prices.
- Request drawers expose GMT offsets. Verify both UTC boundaries, including
  daylight saving changes. A UTC bridge requires every boundary cost; blank
  interior costs may remain in the invoice aggregate but cannot be allocated
  to individual requests.
