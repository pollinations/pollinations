# AssemblyAI Connector Guide

Canonical vendor: `assemblyai`

## Verified — 2026-08-21

- Status: no supported billing or historical-usage API was found.
- Use the authenticated Usage dashboard and provider invoices as external cost
  truth. Use OP Pollen only for Pollinations' internal model allocation.

Collection steps:

1. Select the exact UTC calendar month in the AssemblyAI Usage dashboard.
2. Record the provider total and any available product/model breakdown.
3. Download the matching invoice or save a dashboard export/screenshot.
4. Preserve the raw evidence in `<collection-dir>/evidence/assemblyai/` and Google Drive.
5. Reconcile the provider total against OP Pollen. Never replace the provider
   total with an internally inferred amount.

## Verified — 2026-09-06

- The Cost dashboard takes the month as URL parameters (UTC days):

  ```
  https://www.assemblyai.com/dashboard/cost?window_size=day&starting_on=<YYYY-MM-01>&ending_before=<YYYY-MM-last-day>
  ```

  Despite its name, `ending_before` includes that calendar day in the export
  (verified November 3, 2026). Select the first and last days inclusive, all
  active and deleted API keys, all regions, and API plus Playground traffic.
  Read "Spend by feature"; book one row per feature (Universal-2, Universal-3
  Pro, Universal-3.5 Pro, the Prompting add-ons on the same models).

## Verified — 2026-10-01

- The signed-in `Cost` page has a custom date picker and `Export breakdown`.
  Select both endpoints of the requested calendar month. Sum the CSV's
  `value` column and reconcile to the dashboard total. The relative date label
  can understate the selected span by a day; verify coverage from the export.
- `Billing` shows aggregate balance and available invoices. Check the complete
  history and pagination state. If no purchase or issued-document signal exists,
  record confirmed invoice absence; do not repeatedly request a nonexistent bill.

Known traps:

- Dashboard totals and invoice periods may not use the same boundaries.
- Internal request counts are not provider billing evidence.
- Keep missing model granularity explicit; do not allocate it without a stated
  and reproducible rule.

## Verified — 2026-10-14

- Account-specific Startup Program email terms can impose monthly grant
  expiry even when the general free-credit help page says credits do not
  expire. Use the account's actual grant terms and dates.
- Billing's single current balance does not identify its cash/credit split or
  current grant lots. Do not classify the whole balance as prepaid cash or
  reuse an older snapshot's user-approved expiry exception. Request the
  current credit-lot breakdown when the dashboard does not expose it.
- Retain established startup terms. A new final-award notice is material evidence:
  record its end date and stop projecting subsequent replenishment. An exception
  approved for an older snapshot does not establish terms for a new award.
