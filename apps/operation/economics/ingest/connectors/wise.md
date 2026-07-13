# Wise Connector Guide

Canonical vendor: `wise`

## Empirical status — 2026-07-10

- Status: profile, balance, and bounded activity APIs work.
- The business context returned four standard currency balances, two nonzero,
  and 44 June activities. The activity response included a pagination cursor.
- No account identifiers or raw bank amounts belong in connector notes or chat.

Use when:

- collecting cash transaction truth
- checking whether an invoice was paid or refunded
- collecting FX-settled transaction amounts for provider invoices
- collecting Wise's own cashback or fees

Primary evidence sources:

- API activity: `GET /v1/profiles/{profileId}/activities`.
- API balances: `GET /v4/profiles/{profileId}/balances?types=STANDARD`.
- API balance statements: use the bounded statement endpoint for a known
  balance ID when activities are not detailed enough.
- Dashboard/export: Wise Activities export.
- Local files: Wise CSV/JSON/screenshots already placed in `data/inbox/`.
- Transaction context: `op_transactions`.

Credentials are SOPS-encrypted in `secrets/env.json` as `WISE_API_TOKEN`,
`WISE_BUSINESS_PROFILE_ID`, and `WISE_BUSINESS_EUR_BALANCE_ID`. Decrypt them in
memory only. Never print token, profile, balance, account, or bank-detail values.

Official references:

- https://docs.wise.com/api-reference/activity
- https://docs.wise.com/api-reference/balance

Collection steps:

1. Prefer existing `op_transactions` when it already covers the requested
   period; it is the Economics cash ledger derived from Wise.
2. For a missing or live period, request Wise activities with explicit ISO 8601
   `since` and `until` bounds, `size=100`, and follow `cursor` with
   `nextCursor` until it is null.
3. For cash now, list `STANDARD` balances and convert each balance to the chosen
   reporting currency with an explicit dated FX source. Do not include Jars
   unless the user asks.
4. Save raw API/export JSON, CSV, or screenshots to `data/inbox/` when the
   result will become durable evidence.
5. Use `agent.system.txt` with `mode: extract` when exported transaction
   evidence needs to become an entry.
6. For reconciliation, compare against invoice entries and `op_transactions`.

Expected entry:

- `cost_category`: schema-safe mapped value from the counterparty/category
- `op_cloud_type`: `null`
- `op_transaction_category`: one of `cloud`, `saas`, `payroll`, `admin`, `office`, `revenue`
- `should_match_op_transaction`: true
- `should_match_op_cloud`: false unless the source also includes provider usage detail

Entry mapping rules for Wise activity payment evidence:

- `provider`: use the counterparty/provider vendor, such as `openai`, `vast.ai`, or `cloudflare`. Use canonical vendor `wise` for Wise's own fees, cashback, or statements.
- Wise cashback maps to canonical vendor `wise`, category `revenue`. Never map
  it to `admin` or `others`.
- `amount`: use the **signed** settled amount — costs positive, refunds/credits/reversals negative — so the signed entries sum to the source total. The number carries the direction; do not record it in prose only.
- `currency`: use the settled Wise currency (from the activity's settled amount — often EUR even when the underlying invoice is USD).
- `period_start` and `period_end`: use the Wise export/activity period unless a matched invoice service period is explicit.
- `op_transaction_category`: map the Wise category/counterparty to one of `cloud`, `saas`, `payroll`, `admin`, `office`, or `revenue`.
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
- `primaryAmount` from the Activities API is display text, not a numeric amount;
  use structured settled amounts from the activity resource or a balance
  statement.
- Activities are cursor-paginated; the first 100 rows are not necessarily the
  complete period.
- A current-month activity range is partial and must not be used as a full-month
  forecast baseline.
- A balance response is a current snapshot. It does not replace bounded Wise
  activities or statements as historical cash evidence.
- Do not expose account tokens or personal banking details in entry notes.

Reconciliation notes:

- Wise rows are strongest for `op_transactions`.
- Wise evidence can validate invoice payment but usually cannot explain `op_cloud` usage.
- Match by vendor alias, date, amount, currency, description, and FX plausibility.
