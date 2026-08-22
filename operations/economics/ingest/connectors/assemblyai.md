# AssemblyAI Connector Guide

Canonical vendor: `assemblyai`

## Verified — 2026-08-21

- Status: no supported billing or historical-usage API was found.
- Use the authenticated Usage dashboard and provider invoices as external cost
  truth. Use OP Pollen only for Pollinations' internal model allocation.

Use when:

- collecting monthly AssemblyAI usage and cost
- reconciling provider cost against transcription models in OP Pollen

Collection steps:

1. Select the exact UTC calendar month in the AssemblyAI Usage dashboard.
2. Record the provider total and any available product/model breakdown.
3. Download the matching invoice or save a dashboard export/screenshot.
4. Preserve the raw evidence in `data/inbox/assemblyai/` and Google Drive.
5. Reconcile the provider total against OP Pollen. Never replace the provider
   total with an internally inferred amount.

Expected entry:

- `cost_category`: `model`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `null` unless a separate payment exists
- `should_match_op_transaction`: false unless separately paid
- `should_match_op_cloud`: true

Known traps:

- Dashboard totals and invoice periods may not use the same boundaries.
- Internal request counts are not provider billing evidence.
- Keep missing model granularity explicit; do not allocate it without a stated
  and reproducible rule.
