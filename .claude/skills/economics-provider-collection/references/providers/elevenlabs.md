# ElevenLabs Connector Guide

Canonical vendor: `elevenlabs`

## Verified — 2026-09-04

- Status: workspace analytics API works with the stored key.
- Login: `elliot@myceli.ai` in the Myceli browser workspace.
- Workspace: `My Workspace` (`myceli`).
- The plan page states the plan name, its monthly price, the renewal date and
  the remaining share of the subscription usage credits. Record all four on the
  balance row. Subscription quota can roll over up to twice the monthly
  allocation while the subscription is retained. Renewal refreshes quota; it
  is not the expiry of the entire remaining balance. Keep PAYG purchase lots
  and their separate expiry terms distinct.
- The response is column-oriented (`columns` plus array-valued `rows`); it
  does not return a `total_cost` property on each row object.

Primary evidence sources:

- API: `POST https://api.elevenlabs.io/v1/workspace/analytics/query/usage-by-product-over-time`
- Invoice/payment: ElevenLabs invoice, top-up receipt, subscription receipt, or Wise/card transaction.
- Dashboard: ElevenLabs workspace billing and analytics.

Required credential:

- `ELEVENLABS_API_KEY` with admin/usage analytics scope.

Live validation:

- Read-only analytics API call tested on 2026-07-10.

Collection steps:

1. Query usage analytics with daily buckets:

   ```bash
   curl -sS "https://api.elevenlabs.io/v1/workspace/analytics/query/usage-by-product-over-time" \
     -H "xi-api-key: $ELEVENLABS_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "start_time": <start_unix_ms>,
       "end_time": <end_unix_ms>,
       "interval_seconds": 86400,
       "column_units": "usd",
       "group_by": ["product_type", "model"],
       "time_zone": "UTC"
     }'
   ```

   Save raw JSON to `<collection-dir>/evidence/elevenlabs-<period>-usage-by-product.json`.

2. Verify the response includes `columns` with `timestamp`, `product_type`,
   `model`, and `total_cost`.
3. Sum `total_cost` by month, product, and model. Preserve the raw provider
   model identifier in `model` and the product type in `resource_sku`. Keep
   only rows with `timestamp` before the exclusive end: the API can include
   zero-cost rows stamped exactly at that end boundary.
4. Save invoice/top-up/subscription evidence separately when reconciling cash.
   Invoices are at `/app/subscription/invoices`; billing-window details are
   under Developers → Analytics → Usage. Preserve each overlapping cycle's
   dates rather than relabeling it as calendar-month usage. Invoice emails can
   come from Eleven Labs Inc. through Stripe, so search supplier text as well
   as provider domains.
5. Use this skill for saved raw evidence.

For current quota, `GET /v1/user/subscription` returns `character_count`,
`character_limit`, `next_character_count_reset_unix`, `tier`, `next_invoice`
and `current_overage`. Verify the visible plan name; the API tier
`growing_business` corresponds to Scale. Carry established rollover terms
forward unless the plan or terms change.

Known traps:

- Usage credits are a non-USD quota; record them as `usage-quota`, never as a
  monetary credit balance.
- A plain runtime key can 401; the key needs workspace analytics/admin scope.
- Analytics usage can differ from invoice cash because subscriptions, overage timing, and top-ups are separate evidence surfaces.
- Grant waterfall assumptions need dashboard or transaction backing.
- Use Unix milliseconds for `start_time` and `end_time`.
