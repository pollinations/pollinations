# xAI Connector Guide

Canonical vendor: `xai`

Use when:

- collecting xAI model/API billing evidence
- reconciling xAI invoices and prepaid top-ups

Primary evidence sources:

- API: xAI management billing invoice ledger.
- Invoice/payment: email receipts, invoices, and Wise/card transactions.

Known traps:

- Use a management API key, not a runtime API key.
- Team ID may need to be discovered from the management `/auth/teams` endpoint before querying billing invoices.
- The invoice ledger has two different source types:
  - cycle invoices: usage for calendar month `m`, typically created in month `m+1`
  - prepaid top-ups: funding/balance purchases, not usage
- Exclude prepaid-token top-up lines from usage totals. Treat them as transaction/payment evidence instead.
- Pending cycle invoices can still represent real usage; status alone should not make usage disappear.

Expected entry:

- `cost_category`: `model`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `cloud` for paid invoices/top-ups, `null` for pure usage evidence
- `should_match_op_transaction`: true for invoices/top-ups, false for pure usage exports
- `should_match_op_cloud`: true for cycle invoice usage
