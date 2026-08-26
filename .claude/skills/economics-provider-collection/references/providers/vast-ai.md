# Vast.ai Connector Guide

Canonical vendor: `vast.ai`

## Verified — 2026-07-10

- Status: `vastai` billing API path works with the Economics key.
- Do not recursively sum every nested `amount`; invoice items and metadata can
  repeat monetary values. Use the top-level charge amount once.

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

   Preserve one reviewed row per billed instance and charge kind. When replacing
   legacy instance rows, compare against a current effective
   `economics_compute_ledger` snapshot so every old entry ID is neutralized and
   require the detailed rows to equal the provider month total before publication.
   Verified instance-to-workload mappings come from
   `vast-ai-workloads.json`; update that registry when the GPU fleet changes.

3. If using dashboard screenshots, save them under `data/inbox/`.
4. Use this skill for saved raw evidence.

Known traps:

- The invoice may be a balance transfer or charged top-up, not exact usage.
- Wise charges may be EUR while the invoice or Vast usage is USD.
- Vast.ai CLI invoice rows can be posting-time rollups. A charge may cover usage before its posting date.
- For usage attribution, charge rows with `quantity` hours cover `[timestamp - quantity hours, timestamp]`.
- When a charge window crosses calendar months, split the amount by overlap across those months. If `quantity` is missing or unusable, fall back to the posting month and explain that caveat.
- Upload/download quantities are network units, not hours; assign them to the
  posting month instead of splitting them over time.
- Always pass explicit `-s` and `-e`; the CLI can otherwise default to too narrow a window.
