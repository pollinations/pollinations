# DeepInfra Connector Guide

Canonical vendor: `deepinfra`

Use when:

- collecting DeepInfra model/API usage cost
- reconciling prepaid DeepInfra usage with `op_cloud` inference rows

Primary evidence sources:

- API: `GET https://api.deepinfra.com/payment/usage?from=<epoch>&to=<epoch>`
- Dashboard/usage: DeepInfra billing or usage screenshots/exports when API access is unavailable.
- Transaction context: `op_transactions` only for top-ups or payments, not pure usage exports.

Known traps:

- The API expects epoch-second `from` and `to` values. Date strings can silently return empty results.
- `total_cost` is reported in cents. Divide by 100 before treating it as USD.
- Bound the window to the requested month. For a current-month check, cap `to` at now so the query does not extend into the future.
- Treat API usage as cloud/inference evidence. Do not force a cash transaction match unless the source is a payment, receipt, or top-up.

Expected entry:

- `cost_category`: `model` or `inference_serverless`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `null` for pure usage exports
- `should_match_op_transaction`: false for pure usage exports
- `should_match_op_cloud`: true
