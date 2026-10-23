# Modal Connector Guide

Canonical vendor: `modal`

## Verified — 2026-10-02

- Status: bounded billing CLI works with the stored token pair.
- Login: `elliot@myceli.ai` in the Myceli browser workspace.
- Workspaces: `myceli-ai`, `myceli-ai2`, `elliot-4`.
- Each workspace has a Starter plan with an included monthly compute credit;
  record its amount and the period it covers on the balance row.
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

   Save raw JSON to `<collection-dir>/evidence/modal-<period>-billing-report.json`.

   Daily reports cannot span more than 31 days, so collect longer history as
   consecutive monthly calls and preserve every raw response.

2. Sum cost by calendar month, `object_id`, app/deployment `description`, and
   `environment`.
3. Preserve the workspace in `account_id`, `object_id` in `resource_id`,
   and the app/deployment description in `resource_name`. Keep all raw
   dimensions in the export; never infer a model from the app name alone.
4. Save dashboard screenshots or invoices separately if the CLI output is zero but the dashboard shows usage.
5. Use this skill for saved raw evidence.

Known traps:

- As of 2026-10-02, the user says Modal is no longer used. Keep historical
  usage, but do not project new usage from September's last value.
- The signed-in `myceli-ai` Credits tab showed one exhausted startup grant;
  the exact award, dates, and balance are in the private close evidence.
  Its monthly plan credit is separate. The larger balance the user identified
  belongs to Daytona's `Myceli AI` wallet, not Modal.
- The `elliot-4` September 1–30 billing cycle showed zero total spend,
  zero credits used, and zero charges; its Credits tab showed only the
  monthly plan credit and an `Apply now` invitation for startup credit.
  `myceli-ai2` also had zero September spend in its bounded CLI report and
  signed-in billing view.
- The monthly included plan credit is separate from a startup grant. Check
  the grant in the exact workspace's Credits view and record each grant lot
  with its own expiry; a historical monthly-plan balance cannot prove a grant.
- Modal billing reports are app/deployment oriented; model attribution depends on app naming or an internal deployment map.
- A successful CLI call can return zero rows for a quiet or still-open period.
- Record a verified-zero month when a bounded closed-month call succeeds with
  no rows; do not interpret it as missing data.
- Modal container/fleet snapshots are not billing totals; use billing report for cost.
- Keep tokens in environment variables, not command output or saved evidence.
- Verify the exact workspace and billing cycle on each balance screenshot;
  an August cycle viewed in September does not prove September's balance.
- The billing report is gross provider usage. Apply known grants as a funding
  waterfall separately; only the amount beyond verified available credit is
  paid/provider-payable.
