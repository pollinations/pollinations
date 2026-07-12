# Perplexity Connector Guide

Canonical vendor: `perplexity`

## Empirical status — 2026-07-10

- Status: internal usage meter works; provider account billing remains manual.
- A read-only `GET /models` probe returned HTTP 404, confirming that the Sonar
  key does not expose an account/models surface.
- `op_pollen` June: USD 13.19 paid plus USD 200.30 quest cost. July partial:
  USD 3.37 paid plus USD 126.98 quest cost.

Use when:

- collecting Perplexity Sonar usage evidence
- checking the Perplexity prepaid balance or grant status
- reconciling Perplexity model cost to Economics

Primary evidence sources:

- Usage: Tinybird `op_pollen` rows where `vendor = 'perplexity'`.
- Per-request detail: saved Sonar response usage/cost fields when available.
- Balance/grants: Perplexity API billing dashboard screenshot or export.
- Cash: receipt, Wise, or `op_transactions`.

Required credential:

- `PERPLEXITY_API_KEY` only when inspecting an already-requested API response;
  do not create a paid completion merely to test billing.

Collection steps:

1. Query bounded `op_pollen` usage for the requested period.
2. Prefer `usage.cost.total_cost` from saved Sonar responses when available;
   otherwise use the Economics meter and show its source.
3. Ask the operator for dashboard evidence when balance, auto-top-up, or grant
   status matters. Save evidence to `data/inbox/`.
4. Use `agent.system.txt` to extract or reconcile it.

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
