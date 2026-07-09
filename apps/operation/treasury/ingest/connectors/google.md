# Google Cloud Connector Guide

Canonical vendor: `google`

Use when:

- collecting Google Cloud / Vertex / BigQuery billing export evidence
- reconciling GCP gross cost, credits, and cloud usage rows
- separating cash cost from credit/discount usage

Primary evidence sources:

- Invoice/payment: Google Cloud invoices or payment receipts.
- Dashboard/usage: Google Cloud Billing reports and credit pages.
- BigQuery: GCP billing export table.
- Transaction context: `op_transactions` vendor `google` when a cash invoice/payment exists.

Collection steps:

1. For invoices, place PDFs/receipts in `data/inbox/`.
2. For billing export evidence, use the service-account JSON from `GCP_BILLING_SA_JSON`.
3. Do not print the service-account JSON.
4. Activate a temporary service-account session and run a bounded BigQuery query for the requested period.
5. Local billing export table from the existing connector:

   ```text
   stellar-verve-465920-b7.billing_export.gcp_billing_export_resource_v1_0180E5_574541_B8F8FD
   ```

6. Safe command shape:

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

   After the dry run succeeds, run the same query without `--dry_run` and save stdout.

7. Save raw query output to `data/inbox/google-<period>-billing-export.json`.
8. Run:
   - invoices: `prompts/billed_usage_01_ingest.system.txt`
   - BigQuery/dashboard usage: `prompts/billed_usage_00_collect_dashboard.system.txt`

Suggested bounded query shape:

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

Service/SKU query for classification:

```sql
SELECT
  FORMAT_DATE('%Y-%m', DATE(usage_start_time)) AS month,
  ANY_VALUE(currency) AS currency,
  service.description AS service,
  sku.description AS sku,
  ROUND(SUM(cost), 2) AS gross_amount,
  ROUND(SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS credits_amount,
  ROUND(SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS net_amount,
  COUNT(*) AS row_count,
  MAX(DATE(usage_start_time)) AS latest_usage
FROM `<billing_export_table>`
WHERE DATE(usage_start_time) >= '<period_start>'
  AND DATE(usage_start_time) < '<period_end_exclusive>'
GROUP BY month, service, sku
ORDER BY month, service, sku
```

Expected finding:

- `cost_category`: `infrastructure`, `model`, `inference_serverless`, `storage`, `network`, or `credit`
- `op_cloud_type`: `inference` for Vertex/model usage, `infra` for general GCP services
- `op_transaction_category`: `cloud` for invoices/payments, `null` for pure BigQuery usage exports
- `should_match_op_transaction`: true for invoices/payments, false for pure usage exports
- `should_match_op_cloud`: true for billing export usage/cost evidence

Known traps:

- Cost is kept in native EUR locally.
- Include `currency` in the raw query output when available. If missing, use `EUR` only when the billing export/account context proves native EUR and explain that in `reconciliation_notes`.
- Billing export produces gross cost and credit rows. Treat `abs(credits_amount)` as credit/discount usage.
- A pure billing export is usage/cost truth, not cash transaction truth.
- BigQuery queries can be broad; always bound by period.
- Avoid writing service-account JSON to repo paths. If a temp key file is needed, use a temp directory and delete it after collection.
- For the main finding, use `amount = net_amount` when the source is a monthly aggregate. Put gross, net, absolute credits, row count, and latest usage in `cost_details`.
- Prefer the service/SKU query when model/inference vs infra classification matters. If only aggregate data is available, use one aggregate infra/unknown finding and explain the missing service split.
- Pure BigQuery exports use `op_transaction_category: null`, `should_match_op_transaction: false`, and `should_match_op_cloud: true`.

Reconciliation notes:

- BigQuery export evidence should reconcile to `op_cloud`.
- Google invoices/payments should reconcile to `op_transactions`.
- Credits and discounts should explain cloud usage without necessarily matching cash movement.
