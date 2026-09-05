# Modal Connector Guide

Canonical vendor: `modal`

## Verified — 2026-09-04

- Status: bounded billing CLI works with the stored token pair.
- Login: `elliot@myceli.ai` in the Myceli browser workspace.
- Workspaces: `myceli-ai`, `myceli-ai2`, `elliot-4`.
- Each workspace has a Starter plan with `$30` included monthly compute credit.
- Zero rows can be valid for a quiet/open period and are not an
  authentication failure.

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

1. Query one bounded calendar month at a time:

   ```bash
   MODAL_TOKEN_ID="$MODAL_TOKEN_ID" \
   MODAL_TOKEN_SECRET="$MODAL_TOKEN_SECRET" \
   modal billing report \
     --start <YYYY-MM-DD> \
     --end <YYYY-MM-DD> \
     --json
   ```

   Save raw JSON to `data/inbox/modal-<period>-billing-report.json`.

   Daily reports cannot span more than 31 days, so collect longer history as
   consecutive monthly calls and preserve every raw response.

2. Sum cost by calendar month, `object_id`, app/deployment `description`, and
   `environment`.
3. Preserve app names in `cost_details` or resource fields because they map to model/deployment attribution.
4. Save dashboard screenshots or invoices separately if the CLI output is zero but the dashboard shows usage.
5. Use this skill for saved raw evidence.

Known traps:

- Modal billing reports are app/deployment oriented; model attribution depends on app naming or an internal deployment map.
- A successful CLI call can return zero rows for a quiet or still-open period.
- Record a verified-zero month when a bounded closed-month call succeeds with
  no rows; do not interpret it as missing data.
- Modal container/fleet snapshots are not billing totals; use billing report for cost.
- Keep tokens in environment variables, not command output or saved evidence.
- The billing report is gross provider usage. Apply known grants as a funding
  waterfall separately; only the amount beyond verified available credit is
  paid/provider-payable.
