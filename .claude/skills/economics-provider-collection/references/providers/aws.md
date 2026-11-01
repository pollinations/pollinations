# AWS Connector Guide

Canonical vendor: `aws`

Dashboard routing (verified 2026-09-05): `elliot@myceli.ai` Chrome window;
Myceli AI payer `301235909293`. Use the registry's Credits link, or Billing and
Cost Management home → Credits. Do not confuse the payer with linked accounts.

## Verified — 2026-08-22

- Status: AWS Credits, Automat-it Glass, Umbrella UI, and the account-scoped
  Umbrella data plane all work under `elliot@myceli.ai`.
- Service grouping is the best current ledger grain: Umbrella exposes named
  Bedrock models such as `Claude Opus 5 [Amazon Bedrock Edition]` as services.
- Keep the accounts separate in raw evidence before summing, because service
  ownership and reseller credits can differ.

Collection steps:

1. For invoices, place PDFs/receipts in `<collection-dir>/evidence/`.
2. Current balance: one `type: balance` row per nonzero grant, identical checked
   `start`, payer `account_id`, grant ID as `resource_id`, and
   `resource_sku: current-balance-lot`. Use estimated remaining amounts and each
   grant's verified `end`. Sum must match Total estimated amount remaining.
   Never append the summed account total alongside its lots.
3. For a closed month, archive the Glass settlement/invoice and use `You Pay`
   as the cash obligation after credits and reseller discounts.
   In the signed-in `myceliai-aws` Glass account, check Invoices and the
   Dashboard's AWS Consumption month selector. Record their latest available
   billing month; if the requested month is absent, keep its settlement and
   original invoice pending instead of using the previous month's figures.
   Check AWS Billing and Cost Management → Bills for the same service month:
   record whether its grand total is still estimated and whether the Invoices
   tab has issued originals. Do not present an estimated bill as an invoice.
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
   period_end="<YYYY-MM-DD>" # use the last calendar day; this API includes endDate

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

9. Save raw API JSON to `<collection-dir>/evidence/aws-umbrella-<period>-cost-and-usage.json`.
10. Use this skill for saved raw evidence.

For the detailed provider ledger, use `groupBy=service` and `source: api` for
Umbrella API results. Preserve the raw service label and AWS account identity;
model joins belong in the registry. Classify `Amazon Bedrock` and services
ending in `[Amazon Bedrock Edition]` as inference. Bedrock Guardrails usage
types and other infrastructure services are infrastructure.

## Verified — 2026-09-05

- Umbrella `groupBy=usagetype` splits the `Amazon Bedrock` service line into
  Nova usage types (`USE1-NovaReel-*`, `USE1-NovaMicro-*`, `USE1-Nova2.0Lite-*`,
  `USE1-NovaCanvas-*`) and Bedrock Guardrails (`USE1-Guardrail-*`). Guardrails
  is the safety layer that checks opted-in prompts for every provider, not a
  model: book it as `type: infra` (`resource_name: Bedrock Guardrails`), never
  as inference. Cost bases can differ: compare net unblended with unblended
  explicitly before bridging detailed usage to the reseller invoice. Do not
  assume the historical agreement of those bases still holds. Console Cost
  Explorer captures taken before the month is
  finalized differ from Umbrella; Umbrella is the ledger source for Bedrock
  usage from August 2026.

Known traps:

- No single AWS surface is authoritative for everything: AWS owns live credit
  balances, Glass owns the closed reseller settlement, and Umbrella owns the
  detailed usage breakdown.
- Do not replace AWS's live estimated credit balance with Glass's remaining
  credit figure. Glass is tied to its latest finalized settlement and can lag
  current unbilled usage.
- Active credits can have different expiry dates. Capture each credit ID,
  estimated remaining amount, expiry, and applicable products; use See complete
  list of services to verify eligibility. Never assign one expiry to the summed
  payer balance or revive an estimated-zero grant from its finalized balance.
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
- Service-name classification matters: Bedrock models are inference; EC2,
  CloudFront, RDS, support and Guardrails are infrastructure. Discounts and
  credits are funding/adjustments, not a separate infrastructure service.
- With `periodGranLevel=month`, use `startDate=<YYYY-MM-01>` and the last calendar day as `endDate`; the API includes the end date. A next-month boundary can return an extra month containing that day. Assert each retained row has the requested `usage_date` and inspect `nextToken` until all pages are collected. Ledger `end` remains the exclusive first day of the following month.
- Reconcile the final invoice against both unblended and net-unblended totals. Keep invoice discounts, consumed credits and remaining balances distinct. An unexplained invoice/usage difference stays pending; do not spread it across model rows or invent cash funding.
- Preserve `service_name` in `resource_name` and the usage type in
  `resource_sku`. Write one Compute row per account/service/usage-type group,
  using `type: inference` or `infra` and the evidenced signed funding split.
- Credits can consume invoices before cash is paid; do not force cash transaction matches for credit-funded months.
