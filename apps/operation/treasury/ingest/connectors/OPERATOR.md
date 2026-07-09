# Billed Usage Operator Guide

This is the central runbook for collecting provider billing and usage evidence.
It is the only meta-doc in this folder. Provider-specific details live in one
guide per provider.

The pattern is:

```text
invoice/payment evidence + dashboard/API/CLI/BigQuery usage evidence
-> billed_usage_ai_finding.v1 in data/processed/<vendor>/entries/
-> phase 2 reconciliation proposes Tinybird evidence updates
-> human approval gates writes
```

Do not write Tinybird from collection. Collection creates source evidence and AI findings only.

## Local Folders

Put raw source evidence here:

```text
data/inbox/
```

After successful extraction, originals move here:

```text
data/processed/<vendor>/raw/
```

Normalized AI findings go here:

```text
data/processed/<vendor>/entries/
```

## Prompts

Use these prompts:

```text
prompts/billed_usage_01_ingest.system.txt
```

For invoices, receipts, billing PDFs, invoice screenshots, payment statements.

```text
prompts/billed_usage_00_collect_dashboard.system.txt
```

For dashboards, APIs, CLIs, BigQuery exports, CSV exports, JSON dumps, cost reports, screenshots.

```text
prompts/billed_usage_02_reconcile.system.txt
```

For dry-run reconciliation against `op_transactions` and `op_cloud`.

## Finding Rules

Every source becomes one compact finding:

```text
schema_version: billed_usage_ai_finding.v1
invoice_record_id: stable source/finding ID, even for non-invoices
source_file: exact local path to the raw source
provider: canonical provider/counterparty when possible
period_start / period_end: usage or billing period
amount / currency: total visible amount when present
cost_category: schema-safe cost bucket
op_cloud_type: gpu | inference | infra | null
op_transaction_category: cloud | saas | payroll | admin | office | revenue | null
should_match_op_transaction: true only for billing/payment/cash evidence
should_match_op_cloud: true for usage/cost evidence
```

## Evidence Roles

Invoices usually answer:

- what was billed
- what was paid or payable
- invoice ID
- cash transaction candidate
- period at invoice level

Dashboards/API/CLI/BigQuery usually answer:

- what was used
- when it was used
- resource IDs
- service names
- GPU/model/serverless/infra split
- granular cost rows

Use both when possible.

## Verification Status

Subagent verified:

- `vast.ai`: PASS
- `openai`: PASS after bounded API fix; needs `OPENAI_ADMIN_KEY` for live collection
- `cloudflare`: PASS after deprecated-endpoint and token/period notes; needs `CLOUDFLARE_TOKEN`
- `wise`: PASS after local helper and mapping rules

Live read-only smoke tested with decrypted local secrets:

- `aws`: PASS, Umbrella auth/users and bounded cost-and-usage query returned rows.
- `azure`: PASS, ARM token and bounded billing-profile invoice query returned rows.
- `google`: PASS, service-account auth, BigQuery dry run, and bounded aggregate query returned rows.
- `openai`: PASS, bounded organization costs query returned one bucket.
- `cloudflare`: PASS, both configured billing tokens returned billing-history rows.
- `wise`: PASS, bounded activities query returned rows.
- `vast.ai`: PASS, bounded CLI invoice query returned rows.

Manual/dashboard evidence only:

- `io.net`: no repeatable connector exists. Use invoices, dashboard screenshots, CSV exports, or API dumps if a human provides them.

Secrets:

- Connector credentials live in `secrets/env.json`.
- `env.json` is SOPS-encrypted. Decrypt with `sops -d secrets/env.json` and keep values in memory only.
- Do not pass encrypted `ENC[...]` values to providers.
- Do not print decrypted secret values in chat, logs, guides, findings, or reconciliation notes.

Still to migrate from Forager programmatic connectors:

- `alibaba`
- `anthropic`
- `community`
- `deepinfra`
- `elevenlabs`
- `fireworks`
- `openrouter`
- `ovhcloud`
- `runpod`
- `xai`

Manual/dashboard providers likely needing guides:

- `assemblyai`
- `bytedance`
- `daytona`
- `digitalocean`
- `fal`
- `github`
- `lambda`
- `modal`
- `nebius`
- `perplexity`
- `pointsflyer`
- `replicate`
- `scaleway`
- `tinybird`
- `vercel`

## Provider Commands

### Vast.ai

Guide: `vast-ai.md`

Best source:

- CLI usage export for GPU usage
- invoice PDF or Wise transaction for billed/payment truth

Command:

```bash
vastai show invoices --raw -s <period-start> -e <period-end>
```

Save to:

```text
data/inbox/vast-ai-<period>.json
```

Granularity:

- charge rows
- posting timestamp
- quantity/hours when available
- GPU usage can be many small rows

Notes:

- Always pass `-s` and `-e`.
- The CLI command may be marked deprecated but is currently the known local read path.
- Invoices may be balance transfers/top-ups, not exact usage totals.
- Wise may show EUR while Vast.ai invoice/usage is USD.

### OpenAI

Guide: `openai.md`

Best source:

- Organization Costs API for usage/cost
- invoices/card statements for payment truth

Required env:

```text
OPENAI_ADMIN_KEY
```

Command:

```bash
curl "https://api.openai.com/v1/organization/costs?start_time=<period_start_epoch_utc>&end_time=<period_end_exclusive_epoch_utc>&bucket_width=1d&limit=<days_in_period>" \
  -H "Authorization: Bearer $OPENAI_ADMIN_KEY" \
  -H "Content-Type: application/json"
```

Save to:

```text
data/inbox/openai-<period>-costs.json
```

Granularity:

- daily cost buckets
- optional project/model/line-item breakdowns when `group_by` is used

Notes:

- Use UTC Unix seconds.
- `start_time` is inclusive; `end_time` is exclusive.
- If `has_more` is true, repeat with `page=<next_page>`.
- Convert `usd` to `USD`.
- Pure usage export should not match `op_transactions`.

### Cloudflare

Guide: `cloudflare.md`

Best source:

- invoice PDFs for billing/payment
- billing history API for invoice/credit history
- dashboard credit pages for startup-credit burn

Required env:

```text
CLOUDFLARE_POLLINATIONS_BILLING_TOKEN
CLOUDFLARE_MYCELI_API_TOKEN
```

Command:

```bash
token_name="CLOUDFLARE_POLLINATIONS_BILLING_TOKEN" # or CLOUDFLARE_MYCELI_API_TOKEN
token_value="$(eval "printf %s \"\${$token_name}\"")"
test -n "$token_value" || { echo "$token_name missing"; exit 1; }

curl --fail-with-body --silent --show-error \
  "https://api.cloudflare.com/client/v4/user/billing/history?per_page=50" \
  -H "Authorization: Bearer $token_value"
```

Save to:

```text
data/inbox/cloudflare-<account>-<period>-billing-history.json
data/inbox/
```

Granularity:

- billing history entries from API
- dashboard-level credit burn for startup credits
- invoice-level details from PDFs

Notes:

- `/user/billing/history` is documented by Cloudflare as deprecated.
- It is not period-scoped; save raw response, then filter locally.
- If the target period is absent from the first page, ask before broad pagination.
- Cloudflare is treated as infra locally.

### Wise

Guide: `wise.md`

Best source:

- Wise activities export for cash truth
- existing local helper when credentials are configured

Safe local helper reference:

```bash
python3 -m ingest.run --dry-run --month <YYYY-MM> --only transactions
```

Run from:

```text
apps/operation/forager/
```

Strict no-write caveat:

- This dry run does not write Tinybird, but may create local backup/snapshot files.
- For strict no-write checks, inspect code/help or use an already exported Wise CSV/JSON.

Save exports to:

```text
data/inbox/
```

Granularity:

- transaction/activity level
- settled currency and counterparty
- strongest source for `op_transactions`, not usage

Notes:

- `provider` should usually be the counterparty vendor, not Wise.
- `amount` in findings should be absolute settled cash amount.
- Use `op_cloud_type: null` for Wise-only evidence.

### AWS

Guide: `aws.md`

Best source:

- Umbrella Cost API for reseller-billed AWS usage
- AWS/AIT/Umbrella invoice PDFs for payment truth

Required env:

```text
UMBRELLA_USERNAME
UMBRELLA_PASSWORD
```

API flow:

```text
POST https://api.umbrellacost.io/api/v1/authentication/token/generate
GET  https://api.umbrellacost.io/api/v1/users
GET  https://api.umbrellacost.io/api/v2/invoices/cost-and-usage
```

Bounded command shape:

```bash
test -n "${UMBRELLA_USERNAME:-}" || { echo "UMBRELLA_USERNAME missing"; exit 1; }
test -n "${UMBRELLA_PASSWORD:-}" || { echo "UMBRELLA_PASSWORD missing"; exit 1; }

period_start="<YYYY-MM-01>"
period_end="<YYYY-MM-DD>" # first day of next month for calendar month

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

account_key="<accountKey>"
cost_type="cost" # also collect discount

curl --fail-with-body --silent --show-error \
  "https://api.umbrellacost.io/api/v2/invoices/cost-and-usage?groupBy=service&periodGranLevel=month&isNetUnblended=true&costType=${cost_type}&startDate=${period_start}&endDate=${period_end}" \
  -H "authorization: ${auth_token}" \
  -H "apikey: ${userkey}:${account_key}:" \
  -H "accept: application/json"
```

Do not print Umbrella tokens, API keys, passwords, or unredacted account metadata in chat.

Save to:

```text
data/inbox/aws-umbrella-<period>-cost-and-usage.json
```

Granularity:

- monthly per-service rows
- account-level split from Umbrella accounts
- Bedrock/model vs infra split by service name

Notes:

- Authorization header is the raw Umbrella token, no `Bearer`.
- Data-plane calls require `apikey: userkey:accountKey:`.
- Response rows should include `usage_date`, `service_name`, and `total_cost`.
- Current local source of truth is Umbrella Cost, not direct AWS Cost Explorer.
- Umbrella coverage starts around 2026-04.
- Bedrock is inference/model; most other AWS services are infra.

### Azure

Guide: `azure.md`

Best source:

- billing profile invoices API
- Azure invoice PDFs
- dashboard credit/sponsorship pages

Required env:

```text
AZURE_TENANT_ID
AZURE_CLIENT_ID
AZURE_CLIENT_SECRET
AZURE_BILLING_ACCOUNT
AZURE_BILLING_PROFILE
```

Token flow:

```bash
for v in AZURE_TENANT_ID AZURE_CLIENT_ID AZURE_CLIENT_SECRET AZURE_BILLING_ACCOUNT AZURE_BILLING_PROFILE; do
  test -n "$(eval "printf %s \"\${$v}\"")" || echo "missing $v"
done

TOKEN="$(
  curl -fsS -X POST "https://login.microsoftonline.com/$AZURE_TENANT_ID/oauth2/v2.0/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "grant_type=client_credentials" \
    --data-urlencode "client_id=$AZURE_CLIENT_ID" \
    --data-urlencode "client_secret=$AZURE_CLIENT_SECRET" \
    --data-urlencode "scope=https://management.azure.com/.default" \
  | jq -r '.access_token'
)"
```

Invoice endpoint:

Microsoft documents `periodStartDate` and `periodEndDate` as `MM-DD-YYYY`.

```bash
curl -fsS \
  -H "Authorization: Bearer $TOKEN" \
  "https://management.azure.com/providers/Microsoft.Billing/billingAccounts/$AZURE_BILLING_ACCOUNT/billingProfiles/$AZURE_BILLING_PROFILE/invoices?api-version=2024-04-01&periodStartDate=<MM-DD-YYYY>&periodEndDate=<MM-DD-YYYY>" \
  > "data/inbox/azure-<YYYY-MM>-billing-invoices.json"
```

Save to:

```text
data/inbox/azure-<period>-billing-invoices.json
```

Granularity:

- invoice-level
- creditAmount vs billedAmount
- dashboard may be needed for detailed service/use breakdown

Notes:

- Full monthly invoices usually appear around day 9 for the previous month.
- Skip one-day purchase receipts unless requested.
- Use `billedAmount.value` for total invoice charges.
- Use `payments[].amount.value` for actual cash payment evidence when present.
- Use `freeAzureCreditApplied.value` and `azurePrepaymentApplied.value` for credit/prepayment burn.
- Do not treat `creditAmount` as sponsorship credit; Azure documents it as refunds, returns, or cancellations.
- Local currency is usually EUR.

### Google Cloud

Guide: `google.md`

Best source:

- BigQuery billing export for usage/cost truth
- Google Cloud invoices/payment receipts for cash truth
- dashboard credit pages for credit context

Required env:

```text
GCP_BILLING_SA_JSON
```

Known billing export table:

```text
stellar-verve-465920-b7.billing_export.gcp_billing_export_resource_v1_0180E5_574541_B8F8FD
```

Suggested bounded query:

```sql
SELECT
  FORMAT_DATE('%Y-%m', DATE(usage_start_time)) AS month,
  ANY_VALUE(currency) AS currency,
  ROUND(SUM(cost), 2) AS gross_amount,
  ROUND(SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS credits_amount,
  ROUND(SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS net_amount,
  COUNT(*) AS row_count,
  MAX(DATE(usage_start_time)) AS latest_usage
FROM `<billing_export_table>`
WHERE DATE(usage_start_time) >= '<period_start>'
  AND DATE(usage_start_time) < '<period_end_exclusive>'
GROUP BY month
ORDER BY month
```

Safe command shape:

```bash
test -n "${GCP_BILLING_SA_JSON:-}" || { echo "GCP_BILLING_SA_JSON missing"; exit 1; }

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
key_file="$tmpdir/gcp-sa.json"
printf '%s' "$GCP_BILLING_SA_JSON" > "$key_file"

export CLOUDSDK_CONFIG="$tmpdir/gcloud"
export GOOGLE_APPLICATION_CREDENTIALS="$key_file"

gcloud auth activate-service-account \
  --key-file="$key_file" \
  --project="stellar-verve-465920-b7" \
  --quiet

bq query \
  --use_legacy_sql=false \
  --format=json \
  --project_id="stellar-verve-465920-b7" \
  --dry_run \
  '<bounded SQL here>'
```

After dry run succeeds, run without `--dry_run` and save stdout.

Save to:

```text
data/inbox/google-<period>-billing-export.json
```

Granularity:

- BigQuery export row aggregation
- gross cost
- credit/discount amount
- service/resource granularity can be added by changing the query group-by
- use the service/SKU query in `google.md` when classification matters

Notes:

- Cost is kept in native EUR locally.
- Main aggregate finding uses `amount = net_amount`; put gross/net/absolute credits in `cost_details`.
- Pure BigQuery usage exports should match `op_cloud`, not `op_transactions`.
- Avoid writing service-account JSON into repo paths.

## Reconciliation Preview

After findings exist, use:

```text
prompts/billed_usage_02_reconcile.system.txt
```

Expected output is proposed updates only:

```json
{
  "proposed_updates": [
    {
      "table": "op_cloud",
      "row_selector": {},
      "previous_evidence": "",
      "evidence_entries": [],
      "confidence": 0.0,
      "reason": ""
    }
  ]
}
```

Format with:

```bash
python3 scripts/billed_usage_02_reconcile_format.py <agent-output.json>
```

Do not write Tinybird until the user explicitly approves.
