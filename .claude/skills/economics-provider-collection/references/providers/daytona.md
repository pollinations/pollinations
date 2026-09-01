# Daytona Connector Guide

Canonical vendor: `daytona`

## Verified — 2026-07-10

- Status: API key validation works; dollar billing remains manual-only.
- `GET /api/api-keys/current` succeeded.
- The same key received HTTP 401 from `GET /api/organizations`, so it cannot
  discover the organization needed for resource usage. The billing wallet
  is not available to this API-key scope.
- Keep invoices/dashboard screenshots as the authoritative dollar source.

Primary evidence sources:

- Cost/balance: Daytona billing dashboard, invoice, receipt, or grant notice.
- Resource usage: `GET https://app.daytona.io/api/organizations/{organizationId}/usage`.
- Cash: Wise or `economics_bank_ledger`.

Required credential:

- `DAYTONA_API_KEY`

Collection steps:

1. If the organization ID is known, collect the requested resource snapshot:

   ```bash
   curl --fail-with-body --silent --show-error \
     "https://app.daytona.io/api/organizations/<organizationId>/usage" \
     -H "Authorization: Bearer $DAYTONA_API_KEY"
   ```

2. For dollars, credits, or invoices, use the dashboard or an exported source.
   Save it to `data/inbox/`.
3. Use this skill to extract or reconcile the bounded evidence.

Known traps:

- Organization usage is resource quota/consumption, not a dollar ledger.
- The billing wallet is not documented for normal API-key access. Do not build
  on private dashboard endpoints or short-lived browser tokens.
- A wallet top-up is funding, not compute cost.
- Prefer invoices for closed months and manual dashboard evidence for balance.

Official references:

- https://www.daytona.io/docs/api-keys
- https://www.daytona.io/docs/en/organizations
