# AWS Connector Guide

Canonical vendor: `aws`

Use when:

- collecting AWS/AIT/Umbrella Cost billing evidence
- separating Bedrock/model usage from infrastructure usage
- reconciling AWS invoices, credits, and cloud usage rows

Primary evidence sources:

- Invoice/payment: AWS reseller/AIT/Umbrella invoices and Wise/card transactions.
- Dashboard/usage: Umbrella Cost cost-and-usage views; AWS console only when direct account evidence is needed.
- API: Umbrella Cost API, not AWS Cost Explorer for the current reseller-billed accounts.
- Transaction context: `op_transactions` vendor `aws` when a cash invoice is paid.

Collection steps:

1. For invoices, place PDFs/receipts in `data/inbox/`.
2. For usage evidence, query Umbrella Cost for the requested period only.
3. Required credentials:
   - `UMBRELLA_USERNAME`
   - `UMBRELLA_PASSWORD`
4. Authentication flow:
   - `POST https://api.umbrellacost.io/api/v1/authentication/token/generate`
   - `GET https://api.umbrellacost.io/api/v1/users`
   - `GET https://api.umbrellacost.io/api/v2/invoices/cost-and-usage`
5. Safe bounded command shape:

   ```bash
   test -n "${UMBRELLA_USERNAME:-}" || { echo "UMBRELLA_USERNAME missing"; exit 1; }
   test -n "${UMBRELLA_PASSWORD:-}" || { echo "UMBRELLA_PASSWORD missing"; exit 1; }

   period_start="<YYYY-MM-01>"
   period_end="<YYYY-MM-DD>" # use the first day of the next month for a calendar month

   auth_json="$(curl --fail-with-body --silent --show-error \
     "https://api.umbrellacost.io/api/v1/authentication/token/generate" \
     -H "Content-Type: application/json" \
     --data "{\"username\":\"${UMBRELLA_USERNAME}\",\"password\":\"${UMBRELLA_PASSWORD}\"}")"

   auth_token="$(printf '%s' "$auth_json" | jq -r '.Authorization')"
   user_apikey="$(printf '%s' "$auth_json" | jq -r '.apikey')"
   userkey="${user_apikey%%:*}"

   users_json="$(curl --fail-with-body --silent --show-error \
     "https://api.umbrellacost.io/api/v1/users" \
     -H "authorization: ${auth_token}" \
     -H "apikey: ${user_apikey}" \
     -H "accept: application/json")"

   printf '%s' "$users_json" | jq '.accounts[] | {accountId, accountName, accountKey}'
   ```

   Do not print `auth_token`, `user_apikey`, `userkey`, passwords, or full unredacted account metadata in chat.

6. For each target `accountKey`, query both `cost` and `discount` cost types:

   ```bash
   account_key="<accountKey>"
   cost_type="cost" # also run with discount

   curl --fail-with-body --silent --show-error \
     "https://api.umbrellacost.io/api/v2/invoices/cost-and-usage?groupBy=service&periodGranLevel=month&isNetUnblended=true&costType=${cost_type}&startDate=${period_start}&endDate=${period_end}" \
     -H "authorization: ${auth_token}" \
     -H "apikey: ${userkey}:${account_key}:" \
     -H "accept: application/json"
   ```

7. Save raw API JSON to `data/inbox/aws-umbrella-<period>-cost-and-usage.json`.
8. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

Expected entry:

- `cost_category`: `model` or `infrastructure`
- `op_cloud_type`: `inference` for Bedrock/model usage, `infra` for other AWS services
- `op_transaction_category`: `cloud` for invoices/payments, `null` for pure usage exports
- `should_match_op_transaction`: true for invoices/payments, false for pure usage exports
- `should_match_op_cloud`: true for usage/cost exports

Known traps:

- Current source of truth is Umbrella Cost because AWS is reseller-billed through Automat-it/AIT.
- The authorization header from Umbrella is the raw token, with no `Bearer` prefix.
- Auth response fields:
  - `.Authorization` is the raw authorization token.
  - `.apikey` is the user API key; the `userkey` is the first colon-separated segment.
- Users response fields:
  - `.accounts[].accountKey` is the Umbrella account key for data-plane calls.
  - `.accounts[].accountId` or account name identifies the AWS account when present.
- Data-plane calls also require an `apikey` header in the shape `userkey:accountKey:`.
- Calls without the account-scoped `apikey` can hang until gateway timeout.
- Two accounts are relevant locally:
  - `813596885972` original account with Bedrock workloads
  - `202731947268` Myceli/AIT infra refactor account
- If both accounts are present, collect both and sum them for the usage month. If only one requested account is needed, choose by AWS account ID/name from the users response and explain the choice in `reconciliation_notes`.
- Umbrella coverage starts around 2026-04. Earlier months may require manual invoice/dashboard evidence.
- Service-name classification matters: Bedrock is model/inference; EC2, CloudFront, RDS, support, discounts, and credits are infra.
- Cost-and-usage rows are month-grain. Use `startDate=<YYYY-MM-01>` and `endDate=<first day of next month>` for a bounded calendar month. Treat dates as UTC/calendar-month boundaries unless the export explicitly states otherwise.
- Expected response row fields include `usage_date`, `service_name`, and `total_cost`. Map `total_cost` to `amount`, `service_name` to `cost_details[].label`, and Bedrock service names to `cost_category: model` / `op_cloud_type: inference`.
- Credits can consume invoices before cash is paid; do not force cash transaction matches for credit-funded months.

Redacted example row:

```json
{
  "usage_date": "2026-06",
  "service_name": "Amazon Bedrock",
  "total_cost": "123.45"
}
```

Mapping:

- `amount`: `123.45`
- `currency`: `USD`
- `cost_category`: `model`
- `op_cloud_type`: `inference`
- `cost_details[].label`: `Amazon Bedrock`

Reconciliation notes:

- API usage evidence should reconcile to `op_cloud`.
- Paid invoice evidence should reconcile to `op_transactions`.
- Credit-funded usage should usually explain `op_cloud` without a cash transaction.
