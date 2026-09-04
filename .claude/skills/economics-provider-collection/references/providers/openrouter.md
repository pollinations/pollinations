# OpenRouter Connector Guide

Canonical vendor: `openrouter`

Canonical accounts:

- `myceli` — Myceli.AI organization.
- `pollinations` — PollinationsAI organization.

## Verified — 2026-08-20

- Status: management-key credit and activity APIs work.
- The activity window is truncated, so a single response cannot prove a
  complete calendar-month total.
- Two organizations are in use: `Myceli.AI` and `PollinationsAI`. The stored
  management key reads the Myceli organization; the Pollinations organization
  must be collected from its separately authenticated dashboard/export.

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
- For an open month, reconcile the exact account usage export first. Model rows
  from the Activity Explorer may be allocated proportionally to that exact
  total when the UI only exposes rounded model values; keep the month marked
  provisional and retain both sources in the reconciliation report.
- Do not reproduce the retired mutable month-open usage cache. Prefer bounded
  activity evidence or an explicit user-reviewed estimate.
- OpenRouter usage has been grant/credit-funded locally; do not force a cash transaction match unless separate payment evidence exists.
- Myceli's first $3,000 grant was exhausted in August 2026. Apply the remaining
  grant to August usage before assigning the residual to purchased credit.
- PollinationsAI received a separate $3,000 startup grant on 2026-07-20; do not
  combine the two organizations' grant balances.
