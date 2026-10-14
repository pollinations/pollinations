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
- Usage analytics use UTC.

## Verified — 2026-09-06

- The balance is made of expiring lots. On the billing page, the clock button
  next to "Remaining Balance" opens the "View expiring credits" dialog, which
  lists each lot with its amount and expiry date ("Credits expiring soonest
  are used first"). Two lots are in play: the Free tier's monthly credit, which
  renews on the 1st, and a promotional grant with a much later expiry.
- Record one `balance` row per lot with the same `start`, `resource_sku`
  `current-balance-lot`, `resource_id` `lot-<expiry>`, and the expiry in `end`;
  the app merges them into one snapshot and consumes the earliest lot first.
  A single `current-balance` row with an empty `end` leaves the credit terms
  unverified and blocks the cash forecast.
- No payment method and no invoices exist, so usage rows are credit-funded
  (`credit` negative, `paid` 0), never cash.
- Usage page with an explicit UTC range and spend view:
  `https://dashboard.exa.ai/usage?tab=activity&from=YYYY-MM-DD&to=YYYY-MM-DD&displayMode=spend`
  (Daily Spend total plus a Search and Contents breakdown).
- Evidence archive: `Exa-credit-lots-2026-09-06.json` in the Drive
  "Supporting Evidence" folder.

Collection steps:

1. Open the billing page in the `myceli.ai` browser workspace.
2. Record the remaining balance as provider credit and the exact check time.
3. Open the usage page and select the complete calendar month in UTC.
4. Save any available usage export separately from the balance snapshot.
5. Archive invoices when they exist; the account had no payment method or
   invoices at verification time.

Known traps:

- Do not classify the promotional balance as prepaid cash.
- A balance snapshot is not monthly usage evidence.
- No activity was visible for August 19–26 at verification time.
