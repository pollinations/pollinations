# xAI Connector Guide

Canonical vendor: `xai`

## Verified — 2026-08-22

- Status: management-key validation, team discovery, invoices, and prepaid
  balance endpoints all work.
- The prepaid API returns raw signed totals in cents; preserve the sign and
  classify purchase, spend, and auto-purchase changes separately.
- The invoice API returns line-level model, cluster, unit type, unit price,
  quantity, and amount detail. Use the sum of `lines[].amount` as gross usage;
  the invoice `total` can be lower because prepaid balance was applied.
- The console Usage page can export daily CSVs for the total account and each
  model. The calendar defaults to local time; on October 6, 2026 its date picker
  also supports explicit `UTC` (`tz=UTC` in the Usage URL). Select UTC and the
  entire month before exporting. Prefer issued cycle invoices; while one is
  unpublished, collect source-backed provisional UTC usage for review.
- Grouping the full 2026 Usage view by API key showed all spend on the
  `pollinations` runtime key. No second usage key was observed.

Primary evidence sources:

- API: xAI management billing invoice ledger.
- Invoice/payment: email receipts, invoices, and Wise/card transactions.

Required credential:

- `XAI_MANAGEMENT_API_KEY`

Collection steps:

1. Validate the key with `GET /auth/management-keys/validation`.
2. Read the scoped team ID from the validation response (`teamId`, or
   `scopeId` when `scope` is `SCOPE_TEAM`). The older `GET /auth/teams`
   route can return 403 for a valid scoped management key.
3. Query `GET /v1/billing/teams/{teamId}/invoices` for cycle invoices.
4. Query `GET /v1/billing/teams/{teamId}/prepaid/balance` for signed balance changes.
5. In the Usage page, select the complete month and group by API key. Confirm
   that every active key is expected.
6. Group by model and export one daily CSV per model plus the unfiltered daily
   total. The model exports must sum exactly to the total export.
7. Archive the raw billing response, each cycle invoice PDF, prepaid-purchase
   PDFs, the total CSV, every model CSV, and the reconciliation report in Drive.
8. Keep cycle invoices and prepaid purchases as separate evidence.

Base URL: `https://management-api.x.ai`.

Known traps:

- Use a management API key, not a runtime API key.
- Team ID may need to be discovered from the management `/auth/teams` endpoint before querying billing invoices.
- The invoice ledger has two different source types:
  - cycle invoices: usage for calendar month `m`, typically created in month `m+1`
  - prepaid top-ups: funding/balance purchases, not usage
- Exclude prepaid-token top-up lines from usage totals. Treat them as transaction/payment evidence instead.
- Pending cycle invoices can still represent real usage; status alone should not make usage disappear.
- Do not use OP Pollen as the provider-usage source. It is the independent
  internal meter being reconciled and can have historical tracking gaps.
- Small amounts move across timezone boundaries, and later exports can add
  historical requests. Verify timezone and source revision separately.
  Preserve both originals and correct the same
  daily entry ID through the batch gate; never append the entire month again
  or overwrite an issued invoice with provisional dashboard usage.
- For the current open month, supersede provisional Pollen-derived provider
  rows with exact dashboard CSV rows. Replace them again with invoice-line rows
  once the monthly cycle invoice closes.
