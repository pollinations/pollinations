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
  are used first"). The Free tier's monthly credit renews on the 1st, and a
  promotional grant has a much later expiry.
- Record one `balance` row per lot with the same `start`, `resource_sku`
  `current-balance-lot`, `resource_id` `lot-<expiry>`, and the expiry in `end`;
  the app merges them into one snapshot and consumes the earliest lot first.
  First check that the displayed lots sum to the header balance. If they do
  not, preserve the unlisted residual as an explicit funding/expiry gap rather
  than assigning it to a displayed lot or adding an account-total row that
  would double-count credit.
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
   The date picker accepts start and end dates directly. Verify the `Daily
   Spend` heading shows the full month after applying them; its endpoint
   breakdown is rounded and need not sum exactly to the displayed total.
4. Save any available usage export separately from the balance snapshot.
5. Archive invoices when they exist; the account had no payment method or
   invoices at verification time.

Known traps:

- The signed-in team switcher can say `Thomas Haferlach's Personal` under
  `elliot@myceli.ai`; the user confirmed this is the authorized business team
  for Economics on 2026-10-02. Verify both before collection.
- The expiring-lots dialog did not account for the full balance at the latest
  check. Do not assume it lists every active credit or invent an expiry for
  the residual.
- Do not classify the promotional balance as prepaid cash.
- A balance snapshot is not monthly usage evidence.
- No activity was visible for August 19–26 at verification time.

## Verified — 2026-10-14

- Billing → Invoices → View all opens the account's private Orb portal.
  **View credit block detail** shows individual blocks, original and remaining
  amounts, effective dates and expiry dates, including future allocations.
- Archive the visible credit table without its signed portal URL. Exclude
  future allocations from current available balances. A dash in the expiry
  column alone is not verified non-expiring terms. Preserve discrepancies
  between the Exa expiry popup and Orb's date display for clarification.
