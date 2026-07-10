# OpenAI Connector Guide

Canonical vendor: `openai`

## Empirical status — 2026-07-10

- Status: organization costs API works with the admin key.
- June returned 30 daily buckets, no next page, and USD 531.2165 total cost.
- Amount values are already currency values; preserve the API currency and
  do not treat them as cents.

Use when:

- collecting OpenAI organization model/API cost
- reconciling OpenAI invoices, credits, grants, or card charges
- filling/checking `op_cloud` inference rows

Primary evidence sources:

- Invoice/payment: OpenAI invoice PDF, receipt, billing email, or card/Wise transaction.
- Dashboard/usage: OpenAI organization billing/cost dashboard.
- API: `GET https://api.openai.com/v1/organization/costs`
- Transaction context: `op_transactions` vendor `openai`.

Collection steps:

1. For invoices, place PDFs/receipts in `data/inbox/`.
2. For API usage, use an admin key with organization read access. Query a bounded period only:

   ```bash
   curl "https://api.openai.com/v1/organization/costs?start_time=<period_start_epoch_utc>&end_time=<period_end_exclusive_epoch_utc>&bucket_width=1d&limit=<days_in_period>" \
     -H "Authorization: Bearer $OPENAI_ADMIN_KEY" \
     -H "Content-Type: application/json"
   ```

   Save raw JSON to `data/inbox/openai-<period>-costs.json`.

3. Use UTC Unix seconds. `start_time` is inclusive; `end_time` is exclusive. For a calendar month, use the first day of the month through the first day of the next month.
4. If the response has `has_more: true`, repeat with `page=<next_page>` and append all buckets before extraction.
5. For dashboard evidence, save screenshots or exports to `data/inbox/`.
6. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

Expected entry:

- `cost_category`: `model` or `inference_serverless`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `cloud` for invoices/card charges, `null` for pure usage exports
- `should_match_op_transaction`: true for invoices/card charges, false for pure API/dashboard usage exports
- `should_match_op_cloud`: true for usage/cost exports

Known traps:

- OpenAI org costs API is paginated with `has_more` and `next_page`.
- Use day buckets for month attribution.
- Sum `results[].amount.value` across buckets for `amount`.
- Convert API currency values such as `usd` to schema/reporting currency `USD`.
- If using `group_by`, put project/model/line-item breakdowns in `cost_details`.
- Credits/grants can pay usage before cash transactions appear.
- Historical local note: a grant starting 2025-12-04 expires 2026-08-01; credit burn may not map to cash transactions.

Reconciliation notes:

- API/dashboard costs explain `op_cloud` inference/model usage.
- Invoices or card charges explain `op_transactions`.
- If usage is grant-funded, do not force a cash transaction match.
