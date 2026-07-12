# ElevenLabs Connector Guide

Canonical vendor: `elevenlabs`

## Empirical status — 2026-07-10

- Status: workspace analytics API works with the stored key.
- June returned 31 daily rows. Summing the `total_cost` column by its column
  index produced USD 208.90.
- The response is column-oriented (`columns` plus array-valued `rows`); it
  does not return a `total_cost` property on each row object.

Use when:

- collecting ElevenLabs workspace usage cost
- reconciling ElevenLabs grant burn, paid overage, top-ups, or subscription charges
- filling/checking `op_cloud` audio/model usage rows

Primary evidence sources:

- API: `POST https://api.elevenlabs.io/v1/workspace/analytics/query/usage-by-product-over-time`
- Invoice/payment: ElevenLabs invoice, top-up receipt, subscription receipt, or Wise/card transaction.
- Dashboard: ElevenLabs workspace billing and analytics.

Required credential:

- `ELEVENLABS_API_KEY` with admin/usage analytics scope.

Live validation:

- Read-only analytics API call tested on 2026-07-10.
- June 2026 returned one API meter row, source `api`, currency `USD`, paid total `208.90`.
- July 2026 partial returned one API meter row, source `api`, currency `USD`, paid total `46.85`.

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
       "column_units": "usd"
     }'
   ```

   Save raw JSON to `data/inbox/elevenlabs-<period>-usage-by-product.json`.

2. Verify the response includes `columns` with `timestamp` and `total_cost`.
3. Sum `total_cost` by month.
4. Save invoice/top-up/subscription evidence separately when reconciling cash.
5. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

Expected entry:

- `cost_category`: `model` or `inference_serverless`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `cloud` for invoices/top-ups/subscription charges, `null` for pure analytics usage
- `should_match_op_transaction`: true for receipts/card charges, false for pure analytics usage
- `should_match_op_cloud`: true for analytics usage evidence

Known traps:

- A plain runtime key can 401; the key needs workspace analytics/admin scope.
- Analytics usage can differ from invoice cash because subscriptions, overage timing, and top-ups are separate evidence surfaces.
- Grant waterfall assumptions need dashboard or transaction backing.
- Use Unix milliseconds for `start_time` and `end_time`.

Reconciliation notes:

- Analytics explains `op_cloud` usage.
- Top-ups/subscriptions/card charges explain `op_transactions`.
- If grant-funded, do not force a same-month cash transaction match.
