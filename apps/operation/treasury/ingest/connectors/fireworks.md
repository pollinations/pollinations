# Fireworks Connector Guide

Canonical vendor: `fireworks`

Use when:

- collecting Fireworks account usage and invoice evidence
- reconciling Fireworks grant burn, postpaid invoices, and prepaid/top-up activity
- filling/checking `op_cloud` model usage rows

Primary evidence sources:

- CLI usage: `firectl billing get-usage --account-costs-only -o json`
- CLI invoices: `firectl billing list-invoices`
- Invoice/payment: Fireworks invoice, receipt, or Wise/card transaction.
- Dashboard: Fireworks billing and account credits.

Required credentials:

- `FIREWORKS_API_KEY`
- `FIREWORKS_API_KEY_MYCELI`
- `FIREWORKS_API_KEY_NEO_GLYPH`
- `FIREWORKS_API_KEY_PIXELMARKET`

Live validation:

- Read-only `firectl` usage and invoice calls tested on 2026-07-10.
- June 2026 returned two CLI meter rows, source `cli`, currency `USD`, credit total `5124.83`, paid total `2432.84`.
- July 2026 partial returned two CLI meter rows, source `cli`, currency `USD`, credit total `824.73`, paid total `278.75`.

Collection steps:

1. For each account API key, query account usage for the requested period:

   ```bash
   firectl billing get-usage \
     --api-key "$FIREWORKS_API_KEY" \
     --start-time <YYYY-MM-DD> \
     --end-time <YYYY-MM-DD> \
     --account-costs-only \
     -o json
   ```

   Save raw JSON to `data/inbox/fireworks-<account>-<period>-usage.json`.

2. Query invoices:

   ```bash
   firectl billing list-invoices --api-key "$FIREWORKS_API_KEY"
   ```

   Save raw text/JSON evidence to `data/inbox/fireworks-<account>-invoices-<date>.txt`.

3. For monthly usage, sum `account_costs.cost_data_items[].total`.
4. Attribute invoices by usage month: postpaid invoices dated on the 1st usually cover the previous month.
5. Keep prepaid credit top-ups separate from usage cost.
6. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

Expected entry:

- `cost_category`: `model` or `inference_serverless`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `cloud` for invoices/top-ups/card charges, `null` for pure usage exports
- `should_match_op_transaction`: true for invoices/top-ups/card charges, false for pure usage exports
- `should_match_op_cloud`: true for usage exports and invoice usage evidence

Known traps:

- Never save API keys in command logs or evidence files.
- Multiple Fireworks accounts are in use; sum all relevant accounts for provider totals.
- Postpaid invoice date is not the usage month.
- `PREPAID_CREDITS` top-ups fund balance; they are not usage consumption.
- Draft or zero-amount invoices should not anchor cash usage.

Reconciliation notes:

- Usage exports explain `op_cloud`.
- Postpaid invoices and top-ups explain `op_transactions`.
- Grant/credit waterfalls should be replayed from the grant start, not just the requested month.
