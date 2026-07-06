# Treasury — Wise as the Transactions Backbone (high-level plan)

**Goal:** `transactions` becomes a direct mirror of the Wise bank account. Wise is the
cash-movement source of truth; Enty leaves the pipeline. Invoice matching is a later,
separate step (manual, chat-driven) — not in scope here.

**Settled with Elliot (2026-07-07):**
- One table. No separate `wise_transactions` datasource, no reconciliation view.
- Columns reduced to exactly: `date, vendor, category, charged_amount, charged_currency`.
- `paid_*`, `invoice_ref`, `match_status` are dropped. Source-currency amounts are
  knowingly lost ("the money is gone from our bank account" — the settled leg is what matters).
- Step 1 job: every Wise transaction present, with correct vendor + category.
- P&L spend goes real-time (frontier rule dies; only the current calendar month is
  flagged as "in progress").

---

## 1. Forager — Wise connector + transactions builder

- Restore the Wise Activities API connector from git history (`eecd15630c`) as the
  transactions source: month-by-month pull with cursor pagination, SCA-free, creds
  already in `secrets/env.json` (`WISE_API_TOKEN`, `WISE_BUSINESS_PROFILE_ID`).
- Keep: outflows only, status COMPLETED/IN_PROGRESS, skip CARD_CHECK. Skip inflows
  (revenue witness is Stripe; Wise inflows would double-count payouts).
- Amount = Wise primary (settled) amount, parsed from the display string as before.
- Vendor + category via the existing `vendor_aliases.json` engine over the activity
  title + description — roster and category rules transfer unchanged. Unmatched
  counterparties keep `vendor: ""` (visible in the tab; fixed by adding aliases).
- Full-history rebuild each run from `months_start` (2026-01); `--month` splice
  supported like the other tables. Backup/diff/guard machinery unchanged.
- Delete `enty.py` + `test_enty.py` + the enty config keys. New `test_wise.py`
  (adapt the old connector tests from history).

## 2. Tinybird — schema shrink

- `transactions` datasource: 5-column schema, sorting key `date, vendor, category`.
  `transactions_api` pipe trimmed to match.
- Column drops = destructive recreate in the `operations` workspace. Check-verify the
  deploy plan first (and confirm whether the pending `meter_monthly`/`usage_monthly`
  drops are still outstanding — batch if so). **Elliot runs the destructive deploy.**
- Backfill: one forager run repopulates the table from Wise.

## 3. Web app — tab + insights

- `TransactionRow` type + Transactions tab shrink to the 5 columns. Filters
  (period / vendor / category) unchanged.
- Remove the invoice affordance: `InvoiceRef` button and the `/api/files/invoice`
  vite route (no column left to hang it off). This supersedes the uncommitted
  blob-open + recursive-PDF-lookup edits.
- Insights: `transactionCashUsd` = charged leg only; `opexIncompleteFrom` replaced by
  a "current calendar month in progress" flag; footer caveats updated.
- Fixtures + tests updated.

## Uncommitted-work triage

- **Superseded (removed by this change):** enty.py fuzzy-matching additions +
  test_enty.py, TransactionsTab invoice blob-open, vite recursive PDF search.
- **Kept:** `vendor_aliases.json` additions (barbara-khamouguinoff, space-berlin,
  ayushman) — needed for Wise classification.

## Accepted caveats

- Reimbursement transfers to people classify by counterparty (e.g. Thomas's
  Cloudflare reimbursement reads as a transfer to Thomas, not cloudflare/compute).
- Card refunds are inflows → a refunded charge's original outflow stays in spend.
- Wise's own fees appear as rows, classified under the existing `wise` alias.

## Out of scope (step 2+)

- Invoice linking: Elliot drops invoice files into the chat; files get named with the
  interesting fields; we map them to Wise rows together. Adds a nullable ref column then.
- Charged-vs-paid (source currency) amounts, if they ever turn out to matter.
- Dropping Enty for tax filing itself.
