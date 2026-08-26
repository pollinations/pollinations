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

Use when:

- collecting Perplexity Sonar usage evidence
- checking the Perplexity prepaid balance or grant status
- reconciling Perplexity model cost to Economics

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
5. Use `agent.system.txt` to extract or reconcile it.
6. For model attribution, query `economics_pollen_usage_api` and retain paid + quest request
   counts and provider-cost estimates by month/model. For closed months, use
   those rows as proportions only when the provider invoice total is stronger.

Expected entry:

- `cost_category`: `model`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `cloud` for receipts/top-ups
- `should_match_op_transaction`: true only for cash evidence
- `should_match_op_cloud`: true for usage evidence

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

## Rotation

- Rotates `PERPLEXITY_API_KEY` in gen.pollinations.ai's runtime secrets — the
  same env var name this connector lists as `Required credential`. Verify
  empirically whether the economics copy in `secrets/env.json` is the
  identical key value before assuming it stays valid after rotation; update it
  too if shared.
- Mechanism: `POST /generate_auth_token` for a new key (old stays valid),
  deploy, verify with a live `/chat/completions` call using the `sonar` model,
  then `POST /revoke_auth_token` for the old key. Zero downtime.
- SOPS files: `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json`.
- Deploy target: gen's Cloudflare deploy workflow. Health check:
  `POST gen.pollinations.ai/v1/chat/completions` with `sonar` → 200.
- Lowest blast radius of any rotation here (text-only, isolated provider, old
  key valid until the very last step) — the best candidate for proving a
  rotation end-to-end for the first time.
