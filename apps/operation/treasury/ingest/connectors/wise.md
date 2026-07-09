# Wise Connector Guide

Canonical vendor: `wise`

Use when:

- collecting cash transaction truth
- checking whether an invoice was paid or refunded
- finding FX-settled transaction amounts for provider invoices

Primary evidence sources:

- Dashboard/export: Wise Activities export.
- API/local helper: existing Wise ingestion can read activities when credentials are configured.
- Transaction context: `op_transactions`.

Safe local helper reference:

- Run from `apps/operation/forager/`.
- Transaction-only dry run command:

  ```bash
  python3 -m ingest.run --dry-run --month <YYYY-MM> --only transactions
  ```

- This dry run does not write Tinybird, but it may create local backup/snapshot files. Do not run it when the operator was told not to modify files.
- For strict no-write checks, only inspect code/help or use an already exported Wise CSV/JSON.
- The helper fetches a whole Wise month. Filter to the requested provider by local alias/vendor matching in `ingest.wise.vendor_for()` and `ingest.wise.op_transaction_for()`.

Collection steps:

1. Use Wise activities for the requested period only.
2. Save any exported CSV/JSON/screenshots to `data/inbox/`.
3. Run `prompts/billed_usage_00_collect_dashboard.system.txt` for exported transaction evidence when it needs to become an AI finding.
4. For reconciliation, compare against invoice findings and `op_transactions`.

Expected finding:

- `cost_category`: schema-safe mapped value from the counterparty/category
- `op_cloud_type`: `null`
- `op_transaction_category`: one of `cloud`, `saas`, `payroll`, `admin`, `office`, `revenue`
- `should_match_op_transaction`: true
- `should_match_op_cloud`: false unless the source also includes provider usage detail

Finding mapping rules for Wise activity payment evidence:

- `provider`: use the counterparty/provider vendor, such as `openai`, `vast.ai`, or `cloudflare`. Use `Wise Europe SA` only for Wise's own fees, cashback, or statements.
- `amount`: use the absolute settled cash amount for spend/payment findings. Record refund/credit direction in `usage_summary` and `reconciliation_notes`.
- `currency`: use the settled Wise currency from `ingest.wise.settled_amount()`.
- `period_start` and `period_end`: use the Wise export/activity period unless a matched invoice service period is explicit.
- `op_transaction_category`: use the local Wise `op_transaction_for()` category.
- `cost_category`: map only to schema-safe values:
  - `cloud` -> `infrastructure` unless vendor/detail clearly indicates `gpu`, `model`, or `inference_serverless`
  - `saas` -> `admin` or `unknown`
  - `revenue` -> `credit`
  - `office` -> `office`
  - `payroll` -> `payroll`
  - `admin` -> `admin`
- `op_cloud_type`: always `null` for Wise-only cash evidence.
- `should_match_op_transaction`: true.
- `should_match_op_cloud`: false unless paired with separate provider usage detail.

Known traps:

- Wise is cash truth, not usage truth.
- Settled currency is often EUR even when the provider invoice is USD.
- Refunds may reverse prior charges and should not be counted as new spend.
- Some transactions need vendor aliasing or split logic.
- Do not expose account tokens or personal banking details in finding notes.

Reconciliation notes:

- Wise rows are strongest for `op_transactions`.
- Wise evidence can validate invoice payment but usually cannot explain `op_cloud` usage.
- Match by vendor alias, date, amount, currency, description, and FX plausibility.
