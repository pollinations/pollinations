# Modal Connector Guide

Canonical vendor: `modal`

## Verified — 2026-07-10

- Status: bounded billing CLI works with the stored token pair.
- Zero rows can be valid for a quiet/open period and are not an
  authentication failure.

Use when:

- collecting Modal billing report evidence
- reconciling Modal serverless/GPU app spend
- filling/checking `op_cloud` serverless inference or GPU rows

Primary evidence sources:

- CLI: `modal billing report --start <YYYY-MM-DD> --end <YYYY-MM-DD> --json`
- Dashboard: Modal billing page.
- Invoice/payment: Modal receipt, invoice, or Wise/card transaction.

Required credentials:

- `MODAL_TOKEN_ID`
- `MODAL_TOKEN_SECRET`

Live validation:

- Read-only Modal CLI billing report tested on 2026-07-10.
- The CLI path is usable, but a nonzero month should be tested before relying on Modal totals for closed-month reconciliation.

Collection steps:

1. Query a bounded billing period:

   ```bash
   MODAL_TOKEN_ID="$MODAL_TOKEN_ID" \
   MODAL_TOKEN_SECRET="$MODAL_TOKEN_SECRET" \
   modal billing report \
     --start <YYYY-MM-DD> \
     --end <YYYY-MM-DD> \
     --json
   ```

   Save raw JSON to `data/inbox/modal-<period>-billing-report.json`.

2. Sum cost by app/deployment name.
3. Preserve app names in `cost_details` or resource fields because they map to model/deployment attribution.
4. Save dashboard screenshots or invoices separately if the CLI output is zero but the dashboard shows usage.
5. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

Expected entry:

- `cost_category`: `inference_serverless` or `gpu`
- `op_cloud_type`: `inference` for serverless model apps, `gpu` for explicit GPU runtimes
- `op_transaction_category`: `cloud` for invoices/card charges, `null` for pure CLI billing reports
- `should_match_op_transaction`: true for invoices/card charges, false for pure billing reports
- `should_match_op_cloud`: true for billing reports

Known traps:

- Modal billing reports are app/deployment oriented; model attribution depends on app naming or an internal deployment map.
- A successful CLI call can return zero rows for a quiet or still-open period.
- Modal container/fleet snapshots are not billing totals; use billing report for cost.
- Keep tokens in environment variables, not command output or saved evidence.

Reconciliation notes:

- Billing reports explain `op_cloud`.
- Receipts/card charges explain `op_transactions`.
- For serverless rows, app name may be the best available resource ID.
