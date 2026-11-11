# E2B Connector Guide

Canonical vendor: `e2b`

## Verified — 2026-08-27

- Project: `Elliot's Project`
- Project ID: `da33283c-f2bf-414e-87e3-ab8e20cffc46`
- Primary email: `elliot@myceli.ai`
- Billing: <https://console.e2b.dev/project/elliots-project/billing>
- Usage: <https://console.e2b.dev/project/elliots-project/usage>
- Sandboxes: <https://console.e2b.dev/project/elliots-project/sandboxes/monitoring>
- Collection method: dashboard
- Billing currency: USD
- Economics category: Infrastructure
- Check the subscription fee separately from usage.
- The visible balance is usage credit, not prepaid cash.
- Usage analytics use UTC.

Collection steps:

1. Open Billing in the `myceli.ai` browser workspace.
2. Record the remaining usage-credit balance and exact check time.
3. Archive each new invoice separately; record explicit invoice-list coverage.
4. Open Usage, select the complete calendar month in UTC, and record usage cost,
   started and resumed sandboxes, vCPU hours, and RAM hours.
   The range picker has a `Last month` preset; verify its resulting UTC start
   and end in the displayed range before recording totals.
5. Preserve sandbox or template detail when the dashboard or API exposes it.
6. Record E2B usage in the Compute & Infra ledger as `infrastructure`, never as
   model inference.

API and CLI:

- The official API is <https://api.e2b.app> and uses `E2B_API_KEY` through the
  `X-API-Key` header.
- The official JavaScript and Python SDKs and the `e2b` CLI can list operational
  resources such as sandboxes and templates and retrieve sandbox metrics.
- The public API and CLI do not expose the authoritative billing-credit balance,
  invoices, or dashboard usage-cost report. Keep the dashboard as the source of
  truth for those values.
- Use an existing authorized credential when available. Do not create or rotate
  an API key as part of monthly Economics collection.

Known traps:

- Credits apply to usage invoices, not the subscription fee; verify current terms.
- A balance snapshot is not monthly usage evidence.
- Do not classify credits as prepaid cash.
- The Antler approval email links the original program terms:
  <https://docs.google.com/document/d/1F09dDxQyY12FfVW2SQrVaRF2DWGIuAKCQ8cRe0talOM/edit>.
  Verified October 6, 2026: program usage credits expire one year after
  redemption. Verify the redemption date and each separate credit lot before
  assigning an account expiry; the approval email date alone is insufficient.

## Verified — 2026-10-14

- Project Billing now links to shared workspace Billing. Follow that visible
  link, verify Pollinations.ai and the signed-in business email, then open
  **View details for remaining credit**.
- The workspace credit-grants page exposes remaining and original amounts,
  granted date, expiry, and expandable activity. Use the displayed expiry;
  the workspace migration/granted date is not proof of original redemption.
- Current unbilled usage is deducted at the next invoice. Record the displayed
  balance without subtracting it again. Preserve the canonical project account
  for this shared pool; do not add a second workspace-total snapshot.
