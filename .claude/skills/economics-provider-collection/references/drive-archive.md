# Accounting Drive archive

Verified — 2026-10-15 (business Finance root and filing locations).

## Layout

Use the existing business `02 Finance` root
(`1lPh_J4aSJ2v1nFswlBWt9MnyYutsOJu5`) through `elliot@myceli.ai`.
These are folders in one Finance archive, not separate Drives. Verify the root
and current parents before moving files; do not create a parallel Finance tree.

| Folder under `02 Finance` | Purpose |
|---|---|
| `00 Inbox` | Unsorted new material, pending validation and filing |
| `01 Corporate` | Company registration and corporate records |
| `02 Banking` | Original bank statements and settlement exports |
| `03 Revenue` | Sales, payout and revenue-source records |
| `04 Expenses/<YYYY>/<MM Month>/Invoices` | Original supplier invoices, credit notes and separate payment receipts, preserving each document's purpose |
| `04 Expenses/<YYYY>/<MM Month>/Supporting Evidence` | Usage exports, billing observations and other supporting evidence |
| `05 Payroll & Contractors` | Employment, payroll and contractor records |
| `06 Tax & Filings` | Official tax records and filed returns |
| `07 Contracts` | Original contracts and recurring payment schedules |
| `08 Credits & Grants` | Credit awards, grant terms and expiry evidence |
| `09 Accounting` | Accounting ledgers, statements, backups and management planning |
| `09 Accounting/Monthly Close` | The stable Economics source register, close reviews, exact batches and verified results |
| `10 Enty Handover/Original Exports` | Original ENTY ZIP exports, preserving their period and components |
| `98 Reconciliation` | Existing reconciliation working material; reuse its retained sources, not new copies |
| `99 Restricted Raw Imports` | Existing restricted raw imports; preserve access restrictions |

`09 Accounting/Monthly Close` is `1oO7nzUUiTgc_kD2hPoSqDSBgxhZXc1HL`;
`10 Enty Handover/Original Exports` is `1s9rpzzo3M2UNu6_rwkjvzCvt1cWuFwoQ`.
Keep reports, exports, close-review files and source registers out of `Invoices`.
An existing standalone invoice has one canonical file ID; link to it from
Economics and working papers instead of uploading another copy. Original ZIPs
remain distinct source containers even when they include a retained invoice.

In the monthly expense folders, `Invoices` holds original supplier documents;
`Supporting Evidence` holds exports, bank statements, payment summaries, and
JSON evidence that are not supplier invoices. When a billing email has no PDF attachment,
save its original RFC822 `.eml`; if it links to a provider-hosted receipt,
save that original HTML response too. File these in Supporting Evidence and
keep a missing-invoice entry until the supplier's invoice is obtained or its
absence is verified. Never render an email or receipt into a replacement
invoice PDF, or relabel a payment summary or top-up receipt as a usage invoice.

File name: `YYYY-MM-DD__Vendor__Number.pdf`, where the date is the invoice
date (not the email, service, export or payment date) and the month folder
is the invoice date's month. Preserve service coverage separately in the ledger. Add a fourth segment for the account or a qualifier when the
vendor has several accounts (`2026-09-01__Fireworks__ETIXZH-00008__Myceli.pdf`).
Vendor spellings in use: `Anthropic`, `Automat-it`, `BytePlus`, `Cloudflare`,
`DigitalOcean`, `ElevenLabs`, `Fireworks`, `Google-Cloud`, `Lambda`,
`Microsoft`, `OpenRouter`, `OVHcloud`, `Perplexity`, `Replicate`, `Tinybird`,
`fal`, `xAI`.

## Folder IDs

| Month | Invoices folder id |
|---|---|
| 2025-12 | `1VTDKDg52RYLC6IDJefhMJAeuEXI7Bs1q` |
| 2026-01 | `1bz5Y8Iv_56tBuX-CECwkyYnx9XPXJPEi` |
| 2026-02 | `1K5fOSZ7W4UMUvTg5cvekzgxqljSLiN_e` |
| 2026-03 | `13l_ALEE_0Ff7Q-JfgjgQgy3HGgjnonuF` |
| 2026-04 | `1K4hZM48W7I_nyuh6cQgDCT6VlX045JXd` |
| 2026-05 | `1i33ONOK2t7X2YUfLRAil7ApebsVZ-3lv` |
| 2026-06 | `13Qx31jMRVRI5H-X1sDkPZbN-1f-s6MBM` |
| 2026-07 | `1ELn-zo8mZhX3_fmH9YEKaaIoMHHkJVNL` |
| 2026-08 | `1iyaTPqMgYVpvQVPJIHdnBXQlK17A8Eun` |
| 2026-09 | `1xaedH3eoVwLKylYzCVl01k1rclt5rRGc` |
| 2026-10 | `1Bd_awlPPJjduMsHtyFLdc-ChLUKBj_Cn` |

The October 2026 `Supporting Evidence` folder is
`1WJuT599iJV5Klh6aVeb9zT_Lf_2Gh0Rc`.

The `2026` folder is `1t4Fpuf_3ga4mb2kIVe9JkZT43W0geFYO`; create a new month
with the Drive connector (`create_file` with the folder MIME type), then an
`Invoices` subfolder inside it.

## Commands

- Account: `gog --account elliot@myceli.ai`; the generic Drive connection may
  be a different account. Use the business account explicitly for reads as well
  as writes. Verify the accounting parent; an empty generic-connector search
  does not establish that an accounting document is absent. If local access is
  sandbox-blocked, use the approved existing credential outside the sandbox;
  do not create or rotate credentials to work around that limitation.
- Upload: `gog --account elliot@myceli.ai drive upload <file> --parent <folderId> --json --results-only`
  (the local file name becomes the Drive title, so rename before uploading).
- List a folder: Drive connector `search_files` with
  `parentId = '<folderId>' and mimeType = 'application/pdf'`
  (`pageSize` 200). `gog drive search` works for name searches;
  `gog drive ls --query` does not filter by folder.
- Record every upload as one JSON line in the collection's
  `<collection-dir>/evidence/drive-uploads.jsonl`, then link the exact Drive URL from the ledger
  row's `evidence` field.

## Coverage check

Before collecting again or declaring evidence missing, list both `Invoices`
and `Supporting Evidence` for the requested month and adjacent issue/collection
months. Search vendor aliases and known invoice references too. Include JSON,
CSV, screenshots, email and compressed exports, not just PDFs. Follow every
`nextPageToken`; inspect source contents before claiming month coverage.

For a precise folder listing with the business account, use:

```sh
gog --account elliot@myceli.ai drive search "'<verified-folder-id>' in parents and trashed = false" --raw-query --max 100 --json
```

Reuse the active collection's source register before reopening documents. Keep
Drive file ID, original content hash, invoice/account/period facts, Bank entry
IDs, reviewed differences and the last verified ledger state together. Reuse
unchanged content and compare hash plus supplier/account/period context before
treating copies as duplicates. Identical empty exports for different currencies
or periods remain separate evidence. Before recoverable Trash, verify every
active staging and production reference uses the retained copy; preserve an
existing linked ID where possible. If both copies are referenced, prepare the
URL redirects through the named batch/environment gate before removing either.
Keep one stable Drive ID for the register and update it in place rather than
publishing competing indexes.

After an approved append is read back, update the same checkpoint and register
to `applied — verified` before starting another item. A stale pending status
must not trigger another collection, approval request or replay. Record user
corrections to source locations without repeating a superseded access request.

For a historical Bank backfill, index the existing ENTY document exports and
original file hashes against settled Wise IDs in one pass, then prepare a
consolidated evidence batch. Distinguish retained-but-unvalidated sources from
absent invoices. An annual supplier invoice may explicitly schedule recurring
advances or a refund; verify each actual payment against that schedule instead
of requiring a new invoice for every installment. Preserve the original issue
date and do not book the annual bill again.

For fresh ENTY exports, use completed calendar quarters or individual months when a full-year export fails. Verify the exact range and both bank accounts, and include Bank statement, Documents and Report template. Validate the downloaded ZIP and every indexed filename, then archive the original ZIP outside Invoices. Recognition fields can be blank or zero for a valid original PDF; verify the printed invoice facts and original Wise merchant amounts before preparing ledger links.

Compare the archive with the effective Economics rows and their evidence links:
archived but unbooked, linked to the wrong account/period, pending approval, or
verified in the ledger. Preserve unresolved source differences and partial
periods. A balance observation is not monthly usage, and a billing-cycle invoice
is not automatically a calendar-month total. Only call a document `not found`
after recording which business folders and references were checked; an access
error means `archive check blocked`.

For an open dashboard item, carry the reviewed archive check into
`economics_private_config.reconciliation.archiveChecks` through the normal
named-batch/environment approval gate. Store `month` (service month), canonical
`provider`, exact `account`, `checkedAt` (ISO timestamp), `status`, short `note`
(next action/limitation), and exact Drive file links in `evidence`. Use `found`
for relevant retained sources awaiting reconciliation, `partial` when the
required fact is still missing, `not_found` only after the recorded archive
search, and `blocked` for an access failure. Found/partial checks require file
links; folder links do not prove retention. Replace the same provider/account/
month check on each review; remove obsolete checks after verified import.
These annotations never book money, certify coverage or clear issue counts.
Do not put account observations into the public repository or provider registry.

Then compare the archive with the vendor's own invoice list (provider CLI/API,
billing page, or Gmail invoice emails). Download what is missing, rename,
upload, and only then parse and reconcile. Uploaded is not reconciled: verify supplier, account,
invoice number, service period, amount/currency and funding before linking.
Retain genuine missing/lost-document exceptions.
