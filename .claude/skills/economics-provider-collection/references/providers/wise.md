# Wise Connector Guide

Canonical vendor: `wise`

## Verified — 2026-08-22

- Status: profile, balance, and bounded activity APIs work.
- Full-year activity pagination, stable resource IDs, and amount parsing were
  checked against the effective 2026 bank ledger. Historical card/direct-debit
  rows reconcile exactly; statement-only splits remain explicit exceptions.
- No account identifiers or raw bank amounts belong in connector notes or chat.

Primary evidence sources:

- API activity: `GET /v1/profiles/{profileId}/activities`.
- API balances: `GET /v4/profiles/{profileId}/balances?types=STANDARD`.
- API balance statements: use the bounded statement endpoint for a known
  balance ID when activities are not detailed enough.
- Dashboard/export: Wise Activities export; per-balance statement CSVs
  (Balances → statement) — complete settled truth incl. fees and running
  balance, and the workaround while the statement API's SCA key is unregistered.
- In the signed-in Myceli.AI OÜ Business account, open any balance →
  Download → Go to my statements → Statements → Create a statement. Select
  Last month, all four currencies, CSV, and “Display transactions with fees
  shown separately.” Download the resulting ZIP; it contains one CSV per
  currency, including empty files for currencies with no movements. Confirm
  the displayed period and currency list before download.
- Local files: Wise CSV/JSON/screenshots already placed in `<collection-dir>/evidence/`.
- Transaction context: `economics_bank_ledger`.

Credentials are SOPS-encrypted in `secrets/env.json` as `WISE_API_TOKEN`,
`WISE_BUSINESS_PROFILE_ID`, and `WISE_BUSINESS_EUR_BALANCE_ID`. Decrypt them in
memory only. Never print token, profile, balance, account, or bank-detail values.

Official references:

- https://docs.wise.com/api-reference/activity
- https://docs.wise.com/api-reference/balance

Collection steps:

1. Prefer existing `economics_bank_ledger` when it already covers the requested
   period; it is the Economics cash ledger derived from Wise.
2. For a missing or live period, request Wise activities with explicit ISO 8601
   `since` and `until` bounds, `size=100`, and pass the response's `cursor`
   as the next request's `nextCursor` until the response cursor is null.
   Do not use `cursor` as a query parameter or look for a response
   `nextCursor`: either mistake can repeat or truncate the first page.
   Verify unique resource IDs and date coverage after pagination.
   Re-read the preceding 35 days: an activity
   created as pending before the month boundary can settle inside the requested
   month. The statement settlement date still decides which month is booked.
3. For cash-now verification, list `STANDARD` balances and convert each balance
   to the chosen reporting currency with an explicit dated FX source. Do not
   persist the snapshot and do not include Jars unless the user asks.
4. Save raw API/export JSON, CSV, or screenshots to `<collection-dir>/evidence/` when the
   result will become durable evidence.
5. Use this skill when exported transaction
   evidence needs to become an entry.
6. For reconciliation, compare against invoice entries and `economics_bank_ledger`.
   For foreign-currency invoices, match the original `Exchange To` and
   `Exchange To Amount` to the invoice currency and total; do not reconstruct
   the charge with a monthly exchange rate. When fees are shown separately,
   join the original payment and its `FEE-<TransferWise ID>` row by ID,
   settlement date and currency. Verify that principal plus the separate fee
   equals the existing Bank debit before qualifying the invoice. If the
   statement amount already equals the debit, do not add the fee again.
   Preserve both originals and their source file/member references. A matched
   top-up invoice proves funding, not calendar-month usage.

For a monthly pull, use the existing encrypted credentials in a task-scoped
process and call the official Wise APIs directly. Do not add a permanent Wise
ingest script. Follow every activity cursor, overlap the preceding 35 days,
skip cancelled and card-check activity, and stop for genuinely new merchants.
Use statement dates, amounts, currencies, and fees for every proposed
`kind: transaction` bank movement; activity-only amounts are not settled cash
evidence. Show the exact proposals before any ledger write.

Runway requires one separate `kind: opening_balance` row per non-zero statement
currency, all on the same first-of-month anchor date. Derive those anchors only
from statement running balances; never from a current API snapshot or by
back-solving a dashboard total.

Known traps:

- Wise is cash truth, not usage truth.
- Settled currency is often EUR even when the provider invoice is USD.
- Refunds may reverse prior charges and should not be counted as new spend.
- Some transactions need vendor aliasing or split logic.
- `primaryAmount` from the Activities API is display text, not a numeric amount;
  use structured settled amounts from the activity resource or a balance
  statement.
- Activities are cursor-paginated; the first 100 rows are not necessarily the
  complete period.
- A current-month activity range is partial and must not be used as a full-month
  forecast baseline.
- A balance response is a current verification snapshot. It is not persisted
  and does not replace bounded Wise activities, statements, or the opening
  anchor as historical cash evidence.
- Do not expose account tokens or personal banking details in entry notes.
