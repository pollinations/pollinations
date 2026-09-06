# Fireworks Connector Guide

Canonical vendor: `fireworks`

Canonical accounts:

- `myceli` — inactive after August 2026; `elliot@myceli.ai`
- `pollinations` — inactive after August 2026; `elliot@pollinations.ai`
- `et-fy` — inactive after August 2026; `elliot@pollinations.ai`
- `neoglyph` — active; `elliot@neoglyph.ai`
- `pixelmarket` — inactive after August 2026; `elli@pixelmarket.ai`

## Verified — 2026-09-04

- Status (superseded 2026-09-06): every stored key authenticates through
  `firectl` once `-a <Fireworks account ID>` is passed; the earlier
  `PermissionDenied` came from the missing account ID, not the keys. See
  "Verified — 2026-09-06" below.
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

## Verified — 2026-09-06

- Fireworks account IDs (pass with `-a`; `firectl account list --api-key`
  prints the ID the key can reach):

  | Registry id | Fireworks account ID | Display name | Key (sops `operations/economics/ingest/secrets/env.json`) |
  |---|---|---|---|
  | `myceli` | `elliot-l6mb8f24ewds` | Myceli AI | `FIREWORKS_API_KEY_MYCELI` |
  | `pollinations` | `pollinations` | Pollinations.AI | `FIREWORKS_API_KEY` |
  | `neoglyph` | `elliot-neoglyph` | NGLPH OÜ | `FIREWORKS_API_KEY_NEO_GLYPH` |
  | `pixelmarket` | `thomas-nqdgpxxgxvk8` | Pixelmarket.AI | `FIREWORKS_API_KEY_PIXELMARKET` |

  `et-fy` has no stored key. Without `-a`, `firectl` reads `~/.fireworks/auth.ini`
  and returns `PermissionDenied` for every other account.
- Complete monthly model detail = the Orb postpaid invoice, even for
  prepaid-credit accounts: `firectl billing list-invoices --api-key "$KEY" -a <id>`
  lists one `POSTPAID_BILLING` invoice per month (amount `0.00 USD` when
  "Pre-purchase applied" settled it from prepaid credits) with an
  `invoices.withorb.com/view?token=…` URL. The invoice dated the 1st covers the
  previous month (`ETIXZH-00004`, dated 2026-05-01, = Myceli April; `ETIXZH-00003`
  = March). Lines are grouped by section ("LLM input tokens (cached)",
  "LLM input tokens (uncached)", "LLM output tokens", embeddings) × model
  display name with quantity × rate; the section subtotals sum to
  `billing get-usage` USAGE TOTAL to the cent.
- The Orb page is a JavaScript app: `curl` returns a 1.5 KB shell. Read it in
  the signed-in browser (page text), or use the page's Download invoice PDF.
- `firectl billing get-usage --api-key "$KEY" -a <id> --start-time YYYY-MM-DD
  --end-time YYYY-MM-DD --usage-type serverless --group-by model_name` accepts
  dates only (no ISO time) and, for these accounts, prints the account-cost
  totals with an empty Usage table. Use it to confirm the month total, not for
  model detail.
- Dashboard analytics (`POST /api/analytic/usage-costs`, page
  `/account/usage?type=serverless&category=cost`) refuses ranges older than
  100 days: `start_time cannot be more than 100 days in the past`. Closed
  months older than that exist only on the Orb invoices.
- Dashboard routes moved: `/dashboard/*` and `/settings` now render
  "Not Found" while the account chip still shows the signed-in account; use
  `/account/usage`, `/account/billing`, `/settings/account` (shows the
  Account ID).

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
