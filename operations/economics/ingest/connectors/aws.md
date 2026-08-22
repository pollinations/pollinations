# AWS Connector Guide

Canonical vendor: `aws`

## Verified — 2026-08-22

- Status: AWS Credits, Automat-it Glass, Umbrella UI, and the account-scoped
  Umbrella data plane all work under `elliot@myceli.ai`.
- Service grouping is the best current ledger grain: Umbrella exposes named
  Bedrock models such as `Claude Opus 5 [Amazon Bedrock Edition]` as services.
- Keep the accounts separate in raw evidence before summing, because service
  ownership and reseller credits can differ.

Use when:

- collecting AWS/AIT/Umbrella Cost billing evidence
- separating Bedrock/model usage from infrastructure usage
- reconciling AWS invoices, credits, and cloud usage rows

Primary evidence sources, in order by purpose:

- Live grant balance and expiry: AWS Billing and Cost Management → Credits.
  Use `Total estimated amount remaining` for the current OP Cloud balance
  snapshot. The non-estimated amount only updates after invoices finalize.
- Closed-month payable and funding split: Automat-it Glass. Use its monthly
  `Total Usage`, `Savings Plan Discount`, `Reserved Instance Discount`,
  `Credits`, and `You Pay (excl. tax)` values. Archive the Glass invoice when
  one exists.
- Detailed service/model usage: Umbrella Cost API and Cost & Usage Explorer.
  Use `costType=cost` and `groupBy=service`; reconcile the closed-month total to
  Glass.
- Optimization only: Umbrella recommendations and potential savings. Never
  book these as actual usage, discounts, credits, or liabilities.
- Invoice/payment evidence: Glass invoices and Wise/card transactions.
- Transaction context: `op_transactions` vendor `aws` when a cash invoice is paid.

Collection steps:

1. For invoices, place PDFs/receipts in `data/inbox/`.
2. For the current balance, record one dated `type: balance` OP Cloud snapshot
   from AWS Credits using `Total estimated amount remaining`. Preserve each
   active grant's remaining amount and expiry in the evidence notes.
3. For a closed month, archive the Glass settlement/invoice and use `You Pay`
   as the cash obligation after credits and reseller discounts.
4. For usage evidence, query Umbrella Cost for the requested period only.
5. Required credentials:
   - `UMBRELLA_USERNAME`
   - `UMBRELLA_PASSWORD`
6. Authentication flow:
   - `POST https://api.umbrellacost.io/api/v1/authentication/token/generate`
   - `GET https://api.umbrellacost.io/api/v1/users`
   - `GET https://api.umbrellacost.io/api/v2/invoices/cost-and-usage`
7. Safe bounded command shape:

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

8. For each target `accountKey`, query both `cost` and `discount` cost types:

   ```bash
   account_key="<accountKey>"
   cost_type="cost" # also run with discount

   curl --fail-with-body --silent --show-error \
     "https://api.umbrellacost.io/api/v2/invoices/cost-and-usage?groupBy=service&periodGranLevel=month&isNetUnblended=true&costType=${cost_type}&startDate=${period_start}&endDate=${period_end}" \
     -H "authorization: ${auth_token}" \
     -H "apikey: ${userkey}:${account_key}:" \
     -H "accept: application/json"
   ```

9. Save raw API JSON to `data/inbox/aws-umbrella-<period>-cost-and-usage.json`.
10. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

For the detailed provider ledger, use `groupBy=service`. Preserve the AWS
account ID in `resource_id`, classify `Amazon Bedrock` and services ending in
`[Amazon Bedrock Edition]` as inference, and normalize the named edition to the
canonical model slug. Other services are infrastructure.

Expected entry:

- `cost_category`: `model` or `infrastructure`
- `op_cloud_type`: `inference` for Bedrock/model usage, `infra` for other AWS services
- `op_transaction_category`: `cloud` for invoices/payments, `null` for pure usage exports
- `should_match_op_transaction`: true for invoices/payments, false for pure usage exports
- `should_match_op_cloud`: true for usage/cost exports

Known traps:

- No single AWS surface is authoritative for everything: AWS owns live credit
  balances, Glass owns the closed reseller settlement, and Umbrella owns the
  detailed usage breakdown.
- Do not replace AWS's live estimated credit balance with Glass's remaining
  credit figure. Glass is tied to its latest finalized settlement and can lag
  current unbilled usage.
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
- Umbrella API coverage starts in 2026-04 for these accounts. Preserve the
  direct AWS evidence already collected for January-March.
- `discount` can include a large `Credits Remaining` balance rather than
  monthly consumed usage. Do not book that balance as provider cost. Use
  `costType=cost` for service usage and reconcile the closed-month total to the
  settlement/credit-burn evidence separately.
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

## Rotation

- Rotates the `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` pair gen.pollinations.ai
  uses for Bedrock model calls — a different credential from this connector's
  `UMBRELLA_USERNAME`/`UMBRELLA_PASSWORD` reseller-billing login, so rotating it
  does not affect billing collection here.
- Mechanism: IAM `create-access-key` for the same IAM user (old key stays
  valid), deploy, verify `aws sts get-caller-identity` with the new key, then
  `delete-access-key` for the old one. Zero downtime.
- SOPS files: `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json`.
- Deploy target: gen's Cloudflare deploy workflow. Health check:
  `GET gen.pollinations.ai/v1/models` → 200.
- Any failure after the new key is created aborts without deleting the old
  one — it stays valid until the operator retries.
