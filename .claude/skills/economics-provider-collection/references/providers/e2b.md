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
- Plan: Professional at $150/month, excluding usage
- The visible balance is usage credit, not prepaid cash.
- Usage analytics use UTC.

Collection steps:

1. Open Billing in the `myceli.ai` browser workspace.
2. Record the remaining usage-credit balance and exact check time.
3. Archive each new invoice separately; the project had no invoices at
   verification time.
4. Open Usage, select the complete calendar month in UTC, and record usage cost,
   started and resumed sandboxes, vCPU hours, and RAM hours.
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

- Credits apply to usage invoices; they do not cover the $150 monthly plan.
- A balance snapshot is not monthly usage evidence.
- Do not classify credits as prepaid cash.
- The project showed $0 usage for July 28–August 27 at verification time.
