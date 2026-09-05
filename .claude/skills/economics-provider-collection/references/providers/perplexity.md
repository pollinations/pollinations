# Perplexity Connector Guide

Canonical vendor: `perplexity`

## Verified — 2026-08-21

- Status: internal usage meter works; provider account billing remains manual.
- A read-only `GET /models` probe returned HTTP 404, confirming that the Sonar
  key does not expose an account/models surface.
- The logged-in API Platform billing page exposes the current credit balance,
  usage tier, invoice history, a last-30-day total, and a model/SKU billing
  breakdown. It does not expose a calendar-month selector; the available
  presets are last 24 hours, 7 days, 30 days, and year to date.

Primary evidence sources:

- Usage: Tinybird `economics_pollen_usage` rows where `vendor = 'perplexity'`.
- Per-request detail: saved Sonar response usage/cost fields when available.
- Balance/grants: Perplexity API billing dashboard screenshot or export.
- Cash: receipt, Wise, or `economics_bank_ledger`.

Required credential:

- `PERPLEXITY_API_KEY` only when inspecting an already-requested API response;
  do not create a paid completion merely to test billing.

Collection steps:

1. Query bounded `economics_pollen_usage` usage for the requested period.
2. Prefer `usage.cost.total_cost` from saved Sonar responses when available;
   otherwise use the Economics meter and show its source.
3. Ask the operator for dashboard evidence when balance, auto-top-up, or grant
   status matters. Save evidence to `data/inbox/`.
4. For a closed month, open **Invoice history** and download the original PDF.
   The invoice subtotal is the authoritative provider total and its SKU lines
   are the strongest model/request/token detail.
5. Use this skill to extract or reconcile it.
6. For model attribution, query `economics_pollen_usage_api` and retain paid + quest request
   counts and provider-cost estimates by month/model. For closed months, use
   those rows as proportions only when the provider invoice total is stronger.

## Verified — 2026-09-05

- The console's own JSON route gives model and SKU detail with daily buckets,
  but only for the trailing month; export it in the first days of each month.
  Authenticated browser session (elliot@myceli.ai), read-only:

  ```
  GET https://console.perplexity.ai/rest/pplx-api/v2/groups/81749045/usage-analytics?time_bucket=day&time_range=past_month&version=2.18&source=default
  ```

  `time_range` accepts only `past_day`, `past_week`, `past_month`,
  `year_to_date`; `year_to_date` requires `time_bucket=week` (Thursday-start
  buckets); `start`/`end` parameters are ignored. Meters: `api_requests`
  (per model and `search_context_size`), `input_tokens`, `output_tokens`.
  Sum the daily `meter_event_summaries` for the UTC calendar month and save
  the raw JSON to `data/inbox/perplexity/` and Drive.
- Days that have already left the trailing-month window cannot be recovered
  at daily grain; a weekly bucket that straddles a month boundary cannot be
  split. Record what is exact and flag the rest; do not fill it from Pollen.
- No public usage or billing API exists; the console routes are limited to
  `usage-analytics`, `invoices` (credit purchases) and a Stripe portal session.

Known traps:

- The Sonar key does not provide a supported account billing, balance, or
  credit endpoint. Use the dashboard for those questions.
- Perplexity charges appear in the bank/card ledger, not our Stripe merchant
  account.
- Current balance is a snapshot, not historical usage.
- Do not maintain a local balance cache or forecast from the partial month.
- A credit purchase invoice is not model usage. On 2026-08-19, the dashboard
  showed a $62 paid invoice for the user's $50-plus-tax tier purchase; keep it
  in cash evidence and do not add it to `economics_compute_ledger` usage.
- Perplexity per-request search fees were absent from the retained Pollen meter
  until commit `0aa5fb55ef6030493fd4884f209d17fb58737b04` shipped on
  2026-07-03. January–June provider/Pollen drift is therefore historical
  under-metering; July is the partial rollout month. Preserve both source
  ledgers and record the reviewed limitation in the authenticated Economics
  private configuration instead of fabricating a Paid/Quest allocation for the
  missing fees.
- The dashboard's **Year to Date** total covers the current billing group, whose
  invoice series starts on 2026-03-26. It excludes the legacy `HNCVBP` invoice
  series from January through 2026-03-26. Reconcile full-year usage from both
  invoice series; do not compare the current-group YTD card with January–July
  invoices as though they had the same scope.
- As of 2026-08-21, the dashboard showed $1,564.41 remaining, tier 1, and auto
  reload disabled. Keep future balance checks timestamped because usage is live.

Official reference:

- https://docs.perplexity.ai
