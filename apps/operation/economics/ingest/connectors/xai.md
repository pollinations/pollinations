# xAI Connector Guide

Canonical vendor: `xai`

## Empirical status — 2026-07-10

- Status: management-key validation, team discovery, invoices, and prepaid
  balance endpoints all work.
- The June cycle invoice was created July 7, is pending, contains 29 lines,
  and totals 28,644 cents (USD 286.44).
- A separate paid June 26 invoice is a USD 200 prepaid top-up, not usage.
- The prepaid API returned raw signed total `-20000` cents; preserve its sign
  and classify purchase, spend, and auto-purchase changes separately.

Use when:

- collecting xAI model/API billing evidence
- reconciling xAI invoices and prepaid top-ups

Primary evidence sources:

- API: xAI management billing invoice ledger.
- Invoice/payment: email receipts, invoices, and Wise/card transactions.

Required credential:

- `XAI_MANAGEMENT_API_KEY`

Collection steps:

1. Validate the key with `GET /auth/management-keys/validation`.
2. Discover the team with `GET /auth/teams`.
3. Query `GET /v1/billing/teams/{teamId}/invoices` for cycle invoices.
4. Query `GET /v1/billing/teams/{teamId}/prepaid/balance` for signed balance changes.
5. Keep cycle invoices and prepaid purchases as separate evidence.

Base URL: `https://management-api.x.ai`.

Known traps:

- Use a management API key, not a runtime API key.
- Team ID may need to be discovered from the management `/auth/teams` endpoint before querying billing invoices.
- The invoice ledger has two different source types:
  - cycle invoices: usage for calendar month `m`, typically created in month `m+1`
  - prepaid top-ups: funding/balance purchases, not usage
- Exclude prepaid-token top-up lines from usage totals. Treat them as transaction/payment evidence instead.
- Pending cycle invoices can still represent real usage; status alone should not make usage disappear.

Expected entry:

- `cost_category`: `model`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `cloud` for paid invoices/top-ups, `null` for pure usage evidence
- `should_match_op_transaction`: true for invoices/top-ups, false for pure usage exports
- `should_match_op_cloud`: true for cycle invoice usage

## Rotation

- Rotates the runtime `XAI_API_KEY` gen.pollinations.ai uses for chat
  completions — a different credential from this connector's
  `XAI_MANAGEMENT_API_KEY` (billing/invoices). Rotation needs its own
  management-scoped admin credentials (`XAI_MANAGEMENT_KEY`, `XAI_TEAM_ID`) —
  verify empirically whether these are the same value as this connector's
  management key before assuming so; the naming differs slightly.
- Mechanism: `POST /auth/api-keys` cloning the old key's ACLs (old stays
  valid), deploy, verify with a live grok-model completion, then
  `DELETE /auth/api-keys/{old-id}`. Zero downtime.
- SOPS files: `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json`.
- Deploy target: gen's Cloudflare deploy workflow. Health check:
  `POST gen.pollinations.ai/v1/chat/completions` with a grok model → 200.
