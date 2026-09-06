# Fireworks Connector Guide

Canonical vendor: `fireworks`

Canonical accounts:

- `pollinations`
- `et-fy`
- `neoglyph`
- `myceli`
- `pixelmarket`

## Verified — 2026-08-20

- Status: four configured API keys authenticate through `firectl`; the
  `elliot@pollinations.ai` login also contains the separate dashboard-only
  `et-fy` organization.
- Stable Fireworks account IDs do not match the two visible organization names:
  `pollinations` is displayed as `Pollinations.AI`, while `et-fy` is displayed
  as `Pollinations`. Use the IDs, never the menu labels, as ledger keys.
- Fireworks money values are objects with `currency_code`, `units`, and
  `nanos`; parse them as Money objects, not JavaScript numbers.
- Invoice evidence remains necessary to split credit-funded and postpaid cost.
- All four stored keys can read account-level cumulative costs. On 2026-08-20,
  model-grouped `billing get-usage` calls returned `PermissionDenied` for the
  current keys; use the dashboard for model detail unless the key permissions
  are expanded.

Primary evidence sources:

- CLI usage: `firectl billing get-usage --account-costs-only -o json`
- CLI invoices: `firectl billing list-invoices`
- Current account balance snapshot: `firectl account get`
- Invoice/payment: Fireworks invoice, receipt, or Wise/card transaction.
- Dashboard: Fireworks billing and account credits.

Required credentials:

- `FIREWORKS_API_KEY`
- `FIREWORKS_API_KEY_MYCELI`
- `FIREWORKS_API_KEY_NEO_GLYPH`
- `FIREWORKS_API_KEY_PIXELMARKET`

Live validation:

- Read-only `firectl` usage and invoice calls tested on 2026-07-10.

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

   Try provider-native model detail before falling back to the dashboard:

   ```bash
   firectl billing get-usage \
     --api-key "$FIREWORKS_API_KEY" \
     --start-time <YYYY-MM-01> \
     --end-time <next-YYYY-MM-01> \
     --usage-type serverless \
     --group-by model_name \
     -o json
   ```

   If this returns `PermissionDenied`, retain the exact account total and collect
   the same calendar month's model view/export from the billing dashboard.

2. Query invoices:

   ```bash
   firectl billing list-invoices --api-key "$FIREWORKS_API_KEY"
   ```

   Save raw text/JSON evidence to `data/inbox/fireworks-<account>-invoices-<date>.txt`.

3. If the user asks for balance now, query each relevant account with
   `firectl account get` and save the dated snapshot separately.
4. For monthly usage, sum `account_costs.cost_data_items[].total`.
5. Attribute invoices by usage month: postpaid invoices dated on the 1st usually cover the previous month.
6. Keep prepaid credit top-ups separate from usage cost.
7. Use this skill for saved raw evidence.

Known traps:

- Never save API keys in command logs or evidence files.
- Five Fireworks organizations are in use. The `elliot@pollinations.ai` login
  contains `Pollinations.AI` (`pollinations`) and `Pollinations` (`et-fy`);
  treat them as separate accounts and sum all five for vendor totals.
- A current account balance does not prove month-to-date usage. Do not recreate
  the retired month-open balance cache or infer a month solely from two snapshots.
- Postpaid invoice date is not the usage month.
- `PREPAID_CREDITS` top-ups fund balance; they are not usage consumption.
- Draft or zero-amount invoices should not anchor cash usage.
