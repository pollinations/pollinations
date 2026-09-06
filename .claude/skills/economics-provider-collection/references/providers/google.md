# Google Cloud Connector Guide

Canonical vendor: `google`

## Verified — 2026-08-25

- Status: service-account OAuth and bounded BigQuery billing export work.
- Preserve native EUR.
- Billing account: `0180E5-574541-B8F8FD` (`My Billing Account`).
- Billing export project: `stellar-verve-465920-b7` (`Research`). Query all
  billed projects and the non-project scope; do not assume other scopes are zero.
- Balance scope: include only credits usable for compute, infrastructure, or
  model usage. Exclude support-only and other operational-benefit credits.
- Current-month rows are snapshots. Refresh the bounded BigQuery export before
  using them for Runway; `start`/`end` identify actual coverage, while
  `recorded_at` is the ingestion timestamp.

Primary evidence sources:

- Invoice/payment: Google Cloud invoices or payment receipts.
- Dashboard/usage: Google Cloud Billing reports and credit pages.
- BigQuery: GCP billing export table.
- Transaction context: `economics_bank_ledger` vendor `google` when a cash invoice/payment exists.

Collection steps:

1. For invoices, place PDFs/receipts in `<collection-dir>/evidence/`.
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

7. Save raw query output to `<collection-dir>/evidence/google-<period>-billing-export.json`.
8. Use this skill for saved raw evidence.
9. For the current Compute ledger balance, review Billing → Credits → Issued Credits
   and record one dated `type: balance` row containing only remaining credits
   whose usage scope covers compute, infrastructure, or model usage.

Suggested bounded query shape:

```sql
SELECT
  FORMAT_DATE('%Y-%m', DATE(usage_start_time)) AS month,
  currency,
  ROUND(SUM(cost), 2) AS gross_amount,
  ROUND(SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS credits_amount,
  ROUND(SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS net_amount,
  COUNT(*) AS row_count,
  MAX(DATE(usage_start_time)) AS latest_usage
FROM `<billing_export_table>`
WHERE DATE(usage_start_time) >= '<period_start>'
  AND DATE(usage_start_time) < '<period_end_exclusive>'
GROUP BY month, currency
ORDER BY month, currency
```

Service/SKU query for classification:

```sql
SELECT
  FORMAT_DATE('%Y-%m', DATE(usage_start_time)) AS month,
  currency,
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
GROUP BY month, currency, service, sku
ORDER BY month, currency, service, sku
```

Known traps:

- Cost is kept in native EUR locally.
- Preserve the export currency per group; never aggregate different currencies.
- Record signed usage: `paid = -net_amount`, `credit = credits_amount`.
  Preserve adjustment signs; do not turn reversals into usage with `abs()`.
- A credit can be available but unusable for compute. In particular, do not
  count `Enhanced Support` or similar support-only credits in the Balances
  page. Preserve them in evidence notes only.
- Check each grant lot's scope and remaining amount separately; support-only
  lots must not fund a compute forecast.
- A pure billing export is usage/cost truth, not cash transaction truth.
- BigQuery queries can be broad; always bound by period.
- Avoid writing service-account JSON to repo paths. If a temp key file is needed, use a temp directory and delete it after collection.
- Use the service/SKU query for Compute rows (`source: export`), preserving
  the raw SKU and service in `resource_sku`/`resource_name`. Use the monthly
  total only as a reconciliation check, not a second ledger entry.
- If only an aggregate is available, preserve it with the missing split
  stated in evidence; do not label unknown cost as infrastructure.
- Billing exports never create Bank rows; only actual bank movements do.
