# fal.ai Connector Guide

Canonical vendor: `fal`

## Verified — 2026-07-10

- Status: pricing API and internal usage meter work; account billing is manual.
- The unit-price estimate endpoint returns a price without triggering
  inference.
- Use dashboard/invoice evidence for account balance and closed cash charges.

Primary evidence sources:

- Usage: Tinybird `economics_pollen_usage` rows where `vendor = 'fal'`.
- Unit price: `POST https://api.fal.ai/v1/models/pricing/estimate`.
- Closed-month/cash: fal billing dashboard, invoice, receipt, Wise, or
  `economics_bank_ledger`.

Required credential:

- `FAL_KEY`

Collection steps:

1. Query bounded `economics_pollen_usage` usage for the requested period.
2. When price evidence is needed, request an estimate without running a model:

   ```bash
   curl --fail-with-body --silent --show-error \
     -X POST "https://api.fal.ai/v1/models/pricing/estimate" \
     -H "Authorization: Key $FAL_KEY" \
     -H "Content-Type: application/json" \
     --data '{"estimate_type":"unit_price","endpoints":{"<model-id>":{"unit_quantity":1}}}'
   ```

3. Save dashboard/invoice/price evidence to `<collection-dir>/evidence/` and use
   this skill to extract or reconcile it.

## Verified — 2026-09-06

- The Usage dashboard takes the month as a URL parameter:

  ```
  https://fal.ai/dashboard/usage-billing?dateRange=<YYYY-MM-01>T00:00:00Z_to_<YYYY-MM-last>T23:59:59Z
  ```

  The Model API Usage table (two pages) lists every endpoint with quantity,
  unit and cost; book one row per endpoint with the endpoint slug as the label.

## Verified — 2026-10-01

- The signed-in `Usage & Billing` page can select the exact UTC month and
  `Export CSV`. The export contains daily endpoint rows with amount, quantity,
  unit, gross and net values. Sum `net_amount` and reconcile to the rounded
  dashboard `Total Cost`; use endpoint slugs for model-level rows.
- The `Invoices` tab lists both prepaid purchase invoices and monthly service
  invoices. A first-of-month service invoice may cover the **previous** month;
  keep issue date and service period distinct. At the start of a month, the
  just-finished month's service invoice may not yet be listed. Download
  originals from the invoice detail page and retain the provider-issued PDF.
  Prepaid top-ups also have separate payment receipts.
- `Credits & Tiers` shows the live balance and `Credit activity` shows each
  purchase's original expiry, but that table does not show how much remains in
  each lot. Do not assign the live balance to one expiry date without a
  provider-backed remaining-lot breakdown. The [fal Terms of Service](https://fal.ai/legal/terms-of-service)
  state the purchase and promotional credit expiry rules; verify current terms
  during each close.

Known traps:

- Auth uses `Authorization: Key`, not `Bearer`.
- Historical spend has no confirmed public REST endpoint; use Tinybird plus
  dashboard/invoice evidence.
- Do not run inference as a billing smoke test because it consumes real funds.
- A prepaid top-up is funding, not usage cost.
- Preserve dashboard/Tinybird discrepancies for review.

Official reference:

- https://docs.fal.ai
