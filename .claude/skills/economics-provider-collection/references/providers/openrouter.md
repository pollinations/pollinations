# OpenRouter Connector Guide

Canonical vendor: `openrouter`

Canonical accounts:

- `myceli` — Myceli.AI organization.
- `pollinations` — PollinationsAI organization.

Dashboard routing: use the journal's login for each organization in regular
Chrome. Verify Org Account: PollinationsAI before collecting that account.
The Chrome profile email need not match the provider login. Credit Grants shows remaining amount,
expiry, and restrictions; keep purchased credit separate from grants.

## Verified — 2026-09-04

- Status: management-key credit, historical analytics and activity APIs work.
- The activity window is truncated, so a single response cannot prove a
  complete calendar-month total.
- Two organizations are in use: `Myceli.AI` and `PollinationsAI`. The stored
  management key reads the Myceli organization; the Pollinations organization
  must be collected from its separately authenticated dashboard/export.

Primary evidence sources:

- API: `GET https://openrouter.ai/api/v1/activity`
- Full calendar month: `POST https://openrouter.ai/api/v1/analytics/query`
- Current credit snapshot: `GET https://openrouter.ai/api/v1/credits`
- Dashboard: activity and credit/grant pages for older months or grant context.

Required credential:

- `OPENROUTER_MANAGEMENT_API_KEY`, sent as a Bearer token.

Current balance snapshot:

- `/credits` returns `total_credits` and `total_usage`; current remaining credit
  is `total_credits - total_usage`.
- Collect a current balance snapshot for each active balance-tracked account
  during every monthly close, and for an explicit balance request. Verify paid
  versus grant funding and expiry separately. The all-time counters do not
  prove month-to-date usage without a separately evidenced baseline.

## Verified — 2026-10-02

For the management-key organization, prefer the historical analytics API
(verified 2026-11-03). `GET /api/v1/analytics/meta` lists supported fields.
Query explicit UTC `time_range` bounds with metrics `total_usage`,
`credits_usage`, `openrouter_usage`, `byok_usage`, `byok_fees`, and
`request_count`. Save a total query, a `dimensions: ["model"]` query and a
`granularity: "day"` query. Require `metadata.truncated=false` for all three;
model and daily amounts and request counts must reconcile to the total.
`limit: 10000` is supported. Preserve original requests and responses.

Analytics model values are permanent slugs. `/activity` supplies the explicit
`model_permaslug` to `model` relation; `/api/v1/models?output_modalities=all`
supplies `canonical_slug` to `id`. The default models response omits non-text
modalities. Preserve dated variants and reviewed historical mappings.

- For either organization, open Activity → Explore with explicit UTC bounds
  in its own verified browser session,

  ```
  https://openrouter.ai/activity/explore?from=<YYYY-MM-01>T00:00:00.000Z&to=<next-YYYY-MM-01>T00:00:00.000Z
  ```

  Select `Total Usage ($)` by `Model`, `Rollup: Total`, then Chart display
  settings → Download CSV. The original CSV includes every model and exact
  values, including rows hidden from the on-screen table. Sum its `Value`
  column and compare with the rounded Activity Overview total for the same
  organization and UTC range. The CSV has display names but no model slugs;
  preserve those names rather than inventing IDs.

Known traps:

- Use the management API key. Runtime keys cannot read activity.
- The activity endpoint only reaches back a limited recent window, roughly 30 days.
- Do not emit a completed-month total from truncated activity. Use historical
  analytics or the verified organization's dashboard export.
- Activity Explorer CSV: select `Rollup: Total` before download. A Daily
  rollup changes the table grain and does not give a single row per model.
- Activity “Spend” includes OpenRouter credits plus estimated BYOK spend. Check
  the BYOK keys page. If keys exist, separate BYOK before booking OpenRouter
  spend; if none exist, the exported total is OpenRouter spend.
- Collect `PollinationsAI` only after verifying that organization in the page.
  Never substitute the Myceli management key for the Pollinations account.
- Read the grant's displayed expiry; a grant receipt date is not an expiry.
- On the organization's Credits page, inspect each transaction separately:
  `Receipt` opens the original Stripe-hosted receipt; `Get invoice` may create
  a supplier invoice and then change to `View Invoice`. From the hosted invoice,
  use `Download invoice` for the original PDF. Verify the transaction date,
  invoice issue date, receipt number, and account independently; a newly
  generated invoice can have a later issue date than its credit purchase.
  If Chrome blocks the supplier PDF download, keep the original hosted
  receipt and email, and mark the PDF missing rather than recreating one.
- Never proportionally allocate completed-month totals. Keep missing detail as
  an explicit gap.
- Do not reproduce the retired mutable month-open usage cache. Prefer bounded
  activity evidence or an explicit user-reviewed estimate.
- Determine funding from the account's grant and purchased-credit history;
  do not force a cash match without payment evidence.
- Apply eligible remaining grants before purchased credit. Never combine the
  two organizations' balances.
