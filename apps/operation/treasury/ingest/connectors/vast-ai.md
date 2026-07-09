# Vast.ai Connector Guide

Canonical vendor: `vast.ai`

Use when:

- collecting Vast.ai GPU marketplace usage
- reconciling Vast.ai invoices, balance transfers, or Wise charges
- explaining `op_cloud` GPU rows for Vast.ai

Primary evidence sources:

- Invoice/payment: Vast.ai invoice PDF or billing receipt, often a transfer/top-up.
- Dashboard/usage: Vast.ai console billing and instance usage views.
- CLI: `vastai show invoices --raw -s <YYYY-MM-DD> -e <YYYY-MM-DD>`
- Transaction context: `op_transactions` vendor `vast.ai`, usually Wise EUR card charge.

Collection steps:

1. For invoice evidence, place the PDF or receipt in `data/inbox/`.
2. For usage evidence, prefer the CLI raw export:

   ```bash
   vastai show invoices --raw -s <period-start> -e <period-end>
   ```

   Save stdout to `data/inbox/vast-ai-<period>.json`.

3. If using dashboard screenshots, save them under `data/inbox/`.
4. Run:
   - invoices: `prompts/invoice.system.txt`
   - CLI/dashboard usage: `prompts/usage.system.txt`

Expected entry:

- `cost_category`: `gpu`
- `op_cloud_type`: `gpu`
- `op_transaction_category`: `cloud` for payment/invoice documents, `null` for pure usage exports
- `should_match_op_transaction`: true for invoices/transfers, false for pure usage exports
- `should_match_op_cloud`: true for usage exports and GPU invoices

Known traps:

- The invoice may be a balance transfer or charged top-up, not exact usage.
- Wise charges may be EUR while the invoice or Vast usage is USD.
- Vast.ai CLI invoice rows can be posting-time rollups. A charge may cover usage before its posting date.
- For usage attribution, charge rows with `quantity` hours cover `[timestamp - quantity hours, timestamp]`.
- Always pass explicit `-s` and `-e`; the CLI can otherwise default to too narrow a window.

Reconciliation notes:

- A Wise transaction can be `matched` to a Vast invoice when vendor, date, and FX-adjusted amount align.
- `op_cloud` rows should usually be `partial` or matched to a separate usage export unless the usage rows explain the invoice amount.
