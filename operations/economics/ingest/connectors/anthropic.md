# Anthropic Connector Guide

Canonical vendor: `anthropic`

## Verified — 2026-08-21

- Status: API authentication and bounded cost-report collection work.
- The committed collector retrieves seven-day windows without exposing the
  encrypted admin key. Group by `description`; the Cost API then returns parsed
  provider model and token-cost dimensions.
- A zero here is a scoped API result, not proof that every Anthropic account
  or Claude subscription had zero cost; cross-check the console and Wise.

Use when:

- collecting Anthropic organization cost report evidence
- reconciling Anthropic grant burn, paid usage, and card charges
- filling/checking `op_cloud` model usage rows

Primary evidence sources:

- API: `GET https://api.anthropic.com/v1/organizations/cost_report`
- API: `GET https://api.anthropic.com/v1/organizations/usage_report/messages`
- Invoice/payment: Anthropic receipt, card charge, or Wise transaction.
- Dashboard: Anthropic console billing and grant/credit information.

Required credential:

- `ANTHROPIC_ADMIN_KEY`

Live validation:

- Read-only API auth tested on 2026-07-10 with `x-api-key` and `anthropic-version: 2023-06-01`.
- One-day and week-sized windows returned HTTP 200.
- A full-month single request returned HTTP 500 during testing, so prefer week/day chunks and combine them locally.

Collection steps:

1. Query bounded UTC windows. Prefer weekly chunks for month collection:

   ```bash
   curl "https://api.anthropic.com/v1/organizations/cost_report?starting_at=<start_rfc3339>&ending_at=<end_rfc3339>&limit=31" \
     -H "x-api-key: $ANTHROPIC_ADMIN_KEY" \
     -H "anthropic-version: 2023-06-01"
   ```

   Save raw JSON chunks to `data/inbox/anthropic-<period>-cost-report-<chunk>.json`.

   For the reproducible Economics collector:

   ```bash
   sops exec-env secrets/env.json \
     'node scripts/collect-anthropic-cost-report.mjs <start> <end-exclusive> <output.json> description'
   ```

   To explain a cost mismatch by API key, provider model, service tier, and
   context band, collect the matching usage report:

   ```bash
   sops exec-env secrets/env.json \
     'node scripts/collect-anthropic-usage-report.mjs <start> <end-exclusive> <output.json> api_key_id,model,service_tier,context_window'
   ```

2. Sum `data[].results[].amount` across buckets. The API reports amount in cents; divide by 100 for USD.
3. Preserve daily buckets and any result dimensions in `cost_details`.
4. For grant/cash attribution, use dashboard grant details and card/Wise transactions as separate evidence.
5. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

Expected entry:

- `cost_category`: `model` or `inference_serverless`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `cloud` for receipts/card charges, `null` for pure API usage evidence
- `should_match_op_transaction`: true for receipts/card charges, false for pure API cost reports
- `should_match_op_cloud`: true for cost report usage evidence

Known traps:

- Full-month cost report requests can return HTTP 500 even when smaller windows work.
- The organization Cost API accepts `workspace_id` and `description` grouping;
  it does not accept `model` directly. Description grouping populates the model
  field for token costs.
- The Messages Usage API can group by `api_key_id`, `workspace_id`, `model`,
  `service_tier`, and `context_window`; use it to distinguish shared-key usage
  from a tracking or pricing defect.
- Amounts are cents, not dollars.
- Admin key organization scope matters; zero cost can mean no usage or the wrong org.
- Grant waterfall assumptions must be backed by dashboard or transaction evidence, not inferred from the API alone.

Reconciliation notes:

- The cost report explains Anthropic `op_cloud` usage.
- Receipts/card charges explain `op_transactions`.
- If usage is grant-funded, do not force a same-month cash transaction match.
