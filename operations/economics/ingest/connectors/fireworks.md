# Fireworks Connector Guide

Canonical vendor: `fireworks`

Canonical accounts:

- `pollinations`
- `pollinations-ai`
- `neoglyph`
- `myceli`
- `pixelmarket`

## Verified — 2026-08-20

- Status: four configured API keys authenticate through `firectl`; the
  `elliot@pollinations.ai` login also contains a separate `pollinations-ai`
  organization that currently requires a dashboard balance check.
- Fireworks money values are objects with `currency_code`, `units`, and
  `nanos`; parse them as Money objects, not JavaScript numbers.
- Invoice evidence remains necessary to split credit-funded and postpaid cost.
- All four stored keys can read account-level cumulative costs. On 2026-08-20,
  model-grouped `billing get-usage` calls returned `PermissionDenied` for the
  current keys; use the dashboard for model detail unless the key permissions
  are expanded.

Use when:

- collecting Fireworks account usage and invoice evidence
- reconciling Fireworks grant burn, postpaid invoices, and prepaid/top-up activity
- filling/checking `op_cloud` model usage rows

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
7. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

Expected entry:

- `provider_account_id`: one of the five canonical account IDs above
- `cost_category`: `model` or `inference_serverless`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `cloud` for invoices/top-ups/card charges, `null` for pure usage exports
- `should_match_op_transaction`: true for invoices/top-ups/card charges, false for pure usage exports
- `should_match_op_cloud`: true for usage exports and invoice usage evidence

Known traps:

- Never save API keys in command logs or evidence files.
- Five Fireworks organizations are in use. The `elliot@pollinations.ai` login
  contains both `Pollinations` and `Pollinations.AI`; treat them as separate
  accounts and sum all five for provider totals.
- A current account balance does not prove month-to-date usage. Do not recreate
  the retired month-open balance cache or infer a month solely from two snapshots.
- Postpaid invoice date is not the usage month.
- `PREPAID_CREDITS` top-ups fund balance; they are not usage consumption.
- Draft or zero-amount invoices should not anchor cash usage.

Reconciliation notes:

- Usage exports explain `op_cloud`.
- Postpaid invoices and top-ups explain `op_transactions`.
- Grant/credit waterfalls should be replayed from the grant start, not just the requested month.

## Rotation

- Rotates the primary account's `FIREWORKS_API_KEY` in gen.pollinations.ai's
  runtime secrets — the same env var name this connector uses for the primary
  account. Verify empirically whether it's the same key value as the
  economics copy before assuming it stays valid; update `secrets/env.json` too
  if shared. The three sub-account keys (`_MYCELI`, `_NEO_GLYPH`,
  `_PIXELMARKET`) are not touched by this rotation.
- Mechanism: `POST apiKeys` for a new key (old stays valid), deploy, verify
  with a live model call, then `POST apiKeys:delete` for the old key. Zero
  downtime.
- Needs admin credentials beyond the key itself: `FIREWORKS_ACCOUNT_ID`,
  `FIREWORKS_USER_ID` (Fireworks dashboard or `~/.fireworks/auth.ini`).
- SOPS files: `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json`.
- Deploy target: gen's Cloudflare deploy workflow. Health check:
  `POST gen.pollinations.ai/v1/chat/completions` against a Fireworks-backed
  model → 200.
