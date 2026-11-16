# Daytona Connector Guide

Canonical vendor: `daytona`

## Verified — 2026-10-02

- Status: API key validation works; dollar billing remains manual-only.
- `GET /api/api-keys/current` succeeded.
- The same key received HTTP 401 from `GET /api/organizations`, so it cannot
  discover the organization needed for resource usage. The billing wallet
  is not available to this API-key scope.
- Keep invoices/dashboard screenshots as the authoritative dollar source.
- The signed-in `Myceli AI` wallet showed a material balance under Paid
  credit. Its only displayed lot was `Prepaid Commit`, labeled `Mixed credit`,
  with no usage or expiry. The wallet label does not establish whether the
  commit was cash-funded or awarded; preserve that distinction as unresolved
  until the credit agreement or transaction history proves it.
- A custom September 1–30, 2026 Spending view showed no resource or sandbox
  usage. The September subscription invoice list row was paid for zero.
  The portal's invoice View action opened a browser blob that could not be
  archived through the connected browser; the original PDF remains a source
  gap. The Myceli mailbox search found no September Daytona invoice email.
- The original February top-up invoice is already archived in the accounting
  Drive and matches its Wise card settlement. The wallet amount exactly
  reconciles to a round grant plus that top-up less historical provider usage;
  this supports a mixed funding split, but still needs the original credit
  award terms to confirm it. The exact arithmetic is in the private evidence.

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
   Save it to `<collection-dir>/evidence/`.
   For a month longer than 30 days, collect adjacent Spending windows: the
   custom picker can silently clamp a longer range. Verify the applied range,
   local-time UTC offsets, Resource Usage and Per-Sandbox Usage for each
   window. Keyboard time-field entry commits values that DOM filling can
   revert; recheck the displayed bounds after Apply.
3. Use this skill to extract or reconcile the bounded evidence.

Known traps:

- Organization usage is resource quota/consumption, not a dollar ledger.
- The billing wallet is not documented for normal API-key access. Do not build
  on private dashboard endpoints or short-lived browser tokens.
- A wallet top-up is funding, not compute cost.
- The wallet's `Paid credit balance` includes a `Mixed credit` lot; do not
  convert its full amount to cash-funded prepaid cost without source terms.
- Preserve a previously reviewed inferred split as an inference. A single
  mixed provider lot can carry both paid and credit fields in one current
  snapshot; do not invent separate provider lots. Record explicit current
  expiry wording when shown.
- An invoice-list date does not prove its service period. If the connected
  browser blocks a blob PDF, retain the list observation and request an
  ordinary user download; do not work around the access restriction or
  recreate an invoice from a screenshot.
- Prefer invoices for closed months and manual dashboard evidence for balance.

Official references:

- https://www.daytona.io/docs/api-keys
- https://www.daytona.io/docs/en/organizations
