# OpenRouter Connector Guide

Canonical vendor: `openrouter`

## Empirical status — 2026-07-10

- Status: management-key credit and activity APIs work.
- Credit snapshot: USD 3,000.00 total credits, USD 1,460.43 all-time usage,
  USD 1,539.57 remaining.
- Activity returned 1,089 rows covering June 9 through July 9. Because June
  1-8 is absent, this response cannot prove a complete June total.

Use when:

- collecting OpenRouter activity/cost evidence
- reconciling OpenRouter grant-funded inference usage

Primary evidence sources:

- API: `GET https://openrouter.ai/api/v1/activity`
- Current credit snapshot: `GET https://openrouter.ai/api/v1/credits`
- Dashboard: activity and credit/grant pages for older months or grant context.

Required credential:

- `OPENROUTER_MANAGEMENT_API_KEY`, sent as a Bearer token.

Current balance snapshot:

- `/credits` returns `total_credits` and `total_usage`; current remaining credit
  is `total_credits - total_usage`.
- Save a snapshot only when the user asks for balance now. The all-time counters
  do not prove month-to-date usage without a separately evidenced baseline.

Known traps:

- Use the management API key. Runtime keys cannot read activity.
- The activity endpoint only reaches back a limited recent window, roughly 30 days.
- Do not emit a completed-month total from a truncated API window. Use dashboard/manual evidence for older completed months.
- Do not reproduce the retired mutable month-open usage cache. Prefer bounded
  activity evidence or an explicit user-reviewed estimate.
- OpenRouter usage has been grant/credit-funded locally; do not force a cash transaction match unless separate payment evidence exists.

Expected entry:

- `cost_category`: `model`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `null` for activity exports
- `should_match_op_transaction`: false unless separate payment evidence exists
- `should_match_op_cloud`: true

## Rotation

- Rotates the runtime `OPENROUTER_API_KEY` gen.pollinations.ai uses for
  completions — a different credential from this connector's
  `OPENROUTER_MANAGEMENT_API_KEY`, which is also the admin credential the
  rotation itself needs (to create/list/delete runtime keys via the
  management API). If the management key is ever rotated, this connector's
  billing collection needs the new value too.
- Mechanism: `POST /api/v1/keys` cloning the old key's label/limit/
  limit_reset/include_byok_in_limit/expires_at (old stays valid), deploy,
  verify with a live completion, then `DELETE /api/v1/keys/{hash}` for the
  old key. Zero downtime.
- SOPS files: `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json`.
- Deploy target: gen's Cloudflare deploy workflow. Health check: a live
  completion against a configurable test model (default `qwen/qwen3.6-plus`).
