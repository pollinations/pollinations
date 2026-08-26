# Vast.ai Connector Guide

Canonical vendor: `vast.ai`

## Verified — 2026-07-10

- Status: `vastai` billing API path works with the Economics key.
- Do not recursively sum every nested `amount`; invoice items and metadata can
  repeat monetary values. Use the top-level charge amount once.

Use when:

- collecting Vast.ai GPU marketplace usage
- reconciling Vast.ai invoices, balance transfers, or Wise charges
- explaining `economics_compute_ledger` GPU rows for Vast.ai

Primary evidence sources:

- Invoice/payment: Vast.ai invoice PDF or billing receipt, often a transfer/top-up.
- Dashboard/usage: Vast.ai console billing and instance usage views.
- CLI: `vastai show invoices --raw -s <YYYY-MM-DD> -e <YYYY-MM-DD>`
- Transaction context: `economics_bank_ledger` vendor `vast.ai`, usually Wise EUR card charge.

Collection steps:

1. For invoice evidence, place the PDF or receipt in `data/inbox/`.
2. For usage evidence, prefer the CLI raw export:

   ```bash
   vastai show invoices --raw -s <period-start> -e <period-end>
   ```

   Save stdout to `data/inbox/vast-ai-<period>.json`.

   Convert a reviewed month to additive-neutral instance detail with:

   ```bash
   node scripts/vast-ai-usage-reconcile.mjs \
     <raw-invoices.json> <YYYY-MM> <drive-evidence-url> \
     <expected-month-total-usd> <proposal.ndjson> \
     [effective-op-cloud-snapshot.json]
   ```

   The proposal supersedes the prior account-total row and replaces it with
   one row per billed instance and charge kind. Pass a current effective
   `economics_compute_ledger` snapshot when replacing legacy instance rows so every old entry
   ID is neutralized. Its built-in total check must pass before publication.
   Verified instance-to-workload mappings come from
   `vast-ai-workloads.json`; update that registry when the GPU fleet changes.

3. If using dashboard screenshots, save them under `data/inbox/`.
4. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

Expected entry:

- `cost_category`: `gpu`
- `op_cloud_type`: `gpu`
- `resource_id`: Vast.ai instance ID
- `resource_sku`: `gpu-hours`, `storage-hours`, `download-gb`, or `upload-gb`
- `resource_count`: the allocated hours or posted network quantity
- `model`: populated from `vast-ai-workloads.json` when repository fleet
  records or the historical ledger prove the workload; unknown short-lived
  instances stay blank instead of being guessed
- `op_transaction_category`: `cloud` for payment/invoice documents, `null` for pure usage exports
- `should_match_op_transaction`: true for invoices/transfers, false for pure usage exports
- `should_match_op_cloud`: true for usage exports and GPU invoices

Known traps:

- The invoice may be a balance transfer or charged top-up, not exact usage.
- Wise charges may be EUR while the invoice or Vast usage is USD.
- Vast.ai CLI invoice rows can be posting-time rollups. A charge may cover usage before its posting date.
- For usage attribution, charge rows with `quantity` hours cover `[timestamp - quantity hours, timestamp]`.
- When a charge window crosses calendar months, split the amount by overlap across those months. If `quantity` is missing or unusable, fall back to the posting month and explain that caveat.
- Upload/download quantities are network units, not hours; assign them to the
  posting month instead of splitting them over time.
- Always pass explicit `-s` and `-e`; the CLI can otherwise default to too narrow a window.

Reconciliation notes:

- A Wise transaction can be `matched` to a Vast invoice when vendor, date, and FX-adjusted amount align.
- `economics_compute_ledger` rows should usually be `partial` or matched to a separate usage export unless the usage rows explain the invoice amount.
