# ElevenLabs Connector Guide

Canonical vendor: `elevenlabs`

## Verified — 2026-09-04

- Status: workspace analytics API works with the stored key.
- Login: `elliot@myceli.ai` in the Myceli browser workspace.
- Workspace: `My Workspace` (`myceli`).
- Plan: Scale, `$299/month`, renews September 13.
- Remaining quota: `2,844,141` of `4,284,566` usage credits.
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

   Save raw JSON to `data/inbox/elevenlabs-<period>-usage-by-product.json`.

2. Verify the response includes `columns` with `timestamp`, `product_type`,
   `model`, and `total_cost`.
3. Sum `total_cost` by month, product, and model. Preserve the raw provider
   model identifier in `model` and the product type in `resource_sku`.
4. Save invoice/top-up/subscription evidence separately when reconciling cash.
5. Use this skill for saved raw evidence.

Known traps:

- Usage credits are a non-USD quota; record them as `usage-quota`, never as a
  monetary credit balance.
- A plain runtime key can 401; the key needs workspace analytics/admin scope.
- Analytics usage can differ from invoice cash because subscriptions, overage timing, and top-ups are separate evidence surfaces.
- Grant waterfall assumptions need dashboard or transaction backing.
- Use Unix milliseconds for `start_time` and `end_time`.
