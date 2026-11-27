# fal.ai Connector Guide

Canonical vendor: `fal`

## Verified — 2026-11-03

- Documented Platform APIs provide account balances, daily usage and individual
  billed events. Use the dashboard for original invoices and credit-lot details.
- The unit-price estimate endpoint returns a price without triggering
  inference.
- Use dashboard/invoice evidence for account balance and closed cash charges.

Primary evidence sources:

- Balance: `GET https://api.fal.ai/v1/account/billing?expand=credits`.
- Usage: `GET https://api.fal.ai/v1/models/usage`.
- Billed events: `GET https://api.fal.ai/v1/models/billing-events`.
- Independent internal meter: Tinybird `economics_pollen_usage`, `vendor = 'fal'`.
- Unit price: `POST https://api.fal.ai/v1/models/pricing/estimate`.
- Closed-month/cash: fal billing dashboard, invoice, receipt, Wise, or
  `economics_bank_ledger`.

Required credential:

- `FAL_KEY`

Collection steps:

1. Verify the billing API username against the recorded account and signed-in
   dashboard. Read the balance with its collection timestamp.
2. Query usage with explicit `start` and exclusive `end`, `timezone=UTC`,
   `timeframe=day`, `bound_to_timeframe=false`, and `expand=time_series`.
   Follow `next_cursor` until exhausted and verify `has_more=false`.
3. Audit billed events over the same bounds with `limit=10000`, following every
   cursor. Check unique request IDs and timestamp bounds. Sum integer
   `cost_estimate_nano_usd` for precise USD charges; retain quantity, unit and
   `cost_total`. Reconcile usage estimates, billed events and the monthly
   service invoice separately, then compare with Pollen.
4. When price evidence is needed, request an estimate without running a model:

   ```bash
   curl --fail-with-body --silent --show-error \
     -X POST "https://api.fal.ai/v1/models/pricing/estimate" \
     -H "Authorization: Key $FAL_KEY" \
     -H "Content-Type: application/json" \
     --data '{"estimate_type":"unit_price","endpoints":{"<model-id>":{"unit_quantity":1}}}'
   ```

5. Save dashboard/invoice/price evidence to `<collection-dir>/evidence/` and use
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
  state the purchase and promotional credit expiry rules. Retain terms recorded
  at purchase or grant start; recheck new lots, changed terms or contradictory
  evidence. Unknown remaining-lot expiry stays unknown.

Known traps:

- Auth uses `Authorization: Key`, not `Bearer`.
- Account billing requires `billing:usage:read`; usage and billed events also
  require `auth:keys:read` and `account:users:read`. Use existing credentials;
  an access failure is a reason to use the dashboard, not create another key.
- Invoice PDFs round to cents; the detail page can retain more precision.
  Compare gross usage before prepaid application. Zero due is not zero usage.
- Do not run inference as a billing smoke test because it consumes real funds.
- A prepaid top-up is funding, not usage cost.
- Preserve dashboard/Tinybird discrepancies for review.

Official reference:

- https://fal.ai/docs/platform-apis/v1/account/billing
- https://fal.ai/docs/platform-apis/v1/models/usage
- https://fal.ai/docs/platform-apis/v1/models/billing-events
