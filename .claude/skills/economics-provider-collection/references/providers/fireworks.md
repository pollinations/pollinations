# Fireworks Connector Guide

Canonical vendor: `fireworks`

Canonical accounts:

- `myceli` — inactive after August 2026; `elliot@myceli.ai`
- `pollinations` — inactive after August 2026; `elliot@pollinations.ai`
- `et-fy` — inactive after August 2026; `elliot@pollinations.ai`
- `neoglyph` — active; `elliot@neoglyph.ai`
- `pixelmarket` — inactive after August 2026; `elli@pixelmarket.ai`

## Verified — 2026-09-04

- Status: only the Neoglyph key authenticates through `firectl`. Use the
  authenticated dashboards for the four inactive historical accounts.
- `elliot@pollinations.ai` contains both `pollinations` and `et-fy`.
- Stable Fireworks account IDs do not match the two visible organization names:
  `pollinations` is displayed as `Pollinations.AI`, while `et-fy` is displayed
  as `Pollinations`. Use the IDs, never the menu labels, as ledger keys.
- Fireworks money values are objects with `currency_code`, `units`, and
  `nanos`; parse them as Money objects, not JavaScript numbers.
- Invoice evidence remains necessary to split credit-funded and postpaid cost.
- The Neoglyph key reads account usage. Model-grouped usage returned
  `PermissionDenied`; use its dashboard for model detail.
- Browser identity (verified 2026-09-05): `elliot@neoglyph.ai`, displayed
  organization `NGLPH OÜ`, provider Account ID `elliot-neoglyph`; the registry
  key remains `neoglyph`. Confirm in Account settings, not from the tab title.
  If the profile is absent from connected tabs, inspect the native Chrome
  window title and signed-in email before asking the user to reopen it.

Primary evidence sources:

- CLI usage: `firectl billing get-usage --account-costs-only -o json`
- CLI invoices: `firectl billing list-invoices`
- Current account balance snapshot: `firectl account get`
- Invoice/payment: Fireworks invoice, receipt, or Wise/card transaction.
- Dashboard: Fireworks billing and account credits.

Required credential for monthly collection:

- `FIREWORKS_API_KEY_NEO_GLYPH`

Live validation:

- Neoglyph `firectl` usage, invoice, and balance calls tested on 2026-09-04.

Collection steps:

1. Query the active Neoglyph account for the requested period:

   ```bash
   firectl billing get-usage \
     --api-key "$FIREWORKS_API_KEY_NEO_GLYPH" \
     --start-time <YYYY-MM-DD> \
     --end-time <YYYY-MM-DD> \
     --account-costs-only \
     -o json
   ```

   Save raw JSON to `data/inbox/fireworks-<account>-<period>-usage.json`.

   Try provider-native model detail before falling back to the dashboard:

   ```bash
   firectl billing get-usage \
     --api-key "$FIREWORKS_API_KEY_NEO_GLYPH" \
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
   firectl billing list-invoices --api-key "$FIREWORKS_API_KEY_NEO_GLYPH"
   ```

   Save raw text/JSON evidence to `data/inbox/fireworks-<account>-invoices-<date>.txt`.

3. Query the Neoglyph balance with `firectl account get`. Do not refresh the
   four inactive accounts during normal monthly collection.
4. For monthly usage, sum `account_costs.cost_data_items[].total`.
5. Attribute invoices by usage month: postpaid invoices dated on the 1st usually cover the previous month.
6. Keep prepaid credit top-ups separate from usage cost.
7. Use this skill for saved raw evidence.

## Verified — 2026-09-05

- Model detail when `firectl` grouped usage returns an empty `account_usage`:
  the Analytics page's JSON route accepts any ISO range in the authenticated
  browser session (`elliot@neoglyph.ai`):

  ```
  POST https://app.fireworks.ai/api/analytic/usage-costs
  {"start":"<YYYY-MM-01>T00:00:00.000Z","end":"<next-YYYY-MM-01>T00:00:00.000Z","granularity":"total","groupBy":"modelTier","pageSize":500,"pageToken":""}
  ```

  `groupBy` accepts `modelTier` (invoice display names), `model`, `user`,
  `apiKeyId`; `/api/analytic/usage-costs/export` returns a daily CSV. This
  view excludes embedding lines; the postpaid Orb invoice
  (`firectl billing list-invoices`, Invoice URL) is the complete source and
  is the ledger row source, as in July.

Known traps:

- Never save API keys in command logs or evidence files.
- The `elliot@pollinations.ai` login contains `Pollinations.AI`
  (`pollinations`) and `Pollinations` (`et-fy`); treat them as separate
  historical accounts. Refresh only active accounts during normal collection.
- A current account balance does not prove month-to-date usage. Do not recreate
  the retired month-open balance cache or infer a month solely from two snapshots.
- Postpaid invoice date is not the usage month.
- `PREPAID_CREDITS` top-ups fund balance; they are not usage consumption.
- Draft or zero-amount invoices should not anchor cash usage.
- A missing expiry field in the balance response or billing page does not prove
  non-expiry. Verify grant terms for the active Neoglyph account before marking
  credits non-expiring; inactive accounts do not establish Neoglyph's terms.
- User-approved ignore-expiry planning: `resource_sku: current-balance-expiry-assumed`,
  empty `end`, approval date/scope in evidence. Applies only to that snapshot;
  never label it verified non-expiry or silently carry it into a new grant.
- The top navigation credit badge can lag the billing page's Prepaid Credits
  amount. Capture the disagreement; do not select the larger amount or infer
  a grant-versus-cash split from the word prepaid alone.
