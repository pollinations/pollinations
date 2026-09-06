# Accounting Drive archive

Verified — 2026-09-06.

## Layout

Shared accounting Drive: `<YYYY>/<MM Month>/Invoices` holds the vendor
invoices; `<YYYY>/<MM Month>/Supporting Evidence` holds exports, statements,
and JSON evidence that are not invoices.

File name: `YYYY-MM-DD__Vendor__Number.pdf`, where the date is the invoice
date (not the email or payment date) and the month folder is the invoice
date's month. Add a fourth segment for the account or a qualifier when the
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

The `2026` folder is `1t4Fpuf_3ga4mb2kIVe9JkZT43W0geFYO`; create a new month
with the Drive connector (`create_file` with the folder MIME type), then an
`Invoices` subfolder inside it.

## Commands

- Upload: `gog drive upload <file> --parent <folderId> --json --results-only`
  (the local file name becomes the Drive title, so rename before uploading).
- List a folder: Drive connector `search_files` with
  `parentId = '<folderId>' and mimeType = 'application/pdf'`
  (`pageSize` 200). `gog drive search` works for name searches;
  `gog drive ls --query` does not filter by folder.
- Record every upload as one JSON line in the collection's
  `evidence/drive-uploads.jsonl`, then link the Drive URL from the ledger
  row's `evidence` field.

## Coverage check

Before booking a month, list the month folder and compare it with the
vendor's own invoice list (provider CLI/API, billing page, or the Gmail
invoice emails). Download what is missing, rename, upload, and only then
parse and reconcile. The 2026-09-06 sweep closed 51 gaps (Fireworks Orb
invoices for all four accounts, OVHcloud April/May/June/September, Lambda
April/May/July/August weeks, Azure August/September, Google December 2025 and
August 2026, Replicate, ElevenLabs, Tinybird, fal, OpenRouter, Automat-it
July, xAI September).
