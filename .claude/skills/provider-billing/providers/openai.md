# OpenAI billing via API

Validated: 2026-07-03 (live against our org with an Admin API key in spend-audit local secrets).

## Requirements
- Auth: **Admin API key** (`sk-admin-...`), created by an Org Owner at platform.openai.com → Settings → Organization → Admin keys. Regular `sk-`/project keys get 401.

## Known identifiers (our account)
- Credit grant granted Dec 2025, expires **Aug 2026**. Dashboard 2026-07-01: granted $1,565.58, left $516.69. Usage: embeddings + gpt-image.

## Querying costs and credits

### 1. Costs — `GET /v1/organization/costs` (live)
```bash
curl "https://api.openai.com/v1/organization/costs?start_time=1735689600&limit=180&group_by=line_item" \
  -H "Authorization: Bearer $OPENAI_ADMIN_KEY"
```
- `start_time` unix **seconds** (required); `bucket_width` only `1d`; `group_by` ∈ {project_id, line_item, api_key_id}; `limit` ≤ 180 buckets/page → paginate with `page` cursor for long windows.
- Bucket result: `{amount: {value, currency: "usd"}, line_item, project_id, ...}`.
- Companion `/v1/organization/usage/*` gives token-level granularity (1m/1h/1d).
- Live 2026-07-03: paginated successfully across 2 pages / 215 daily buckets.

### 2. Credit grants — NO API (successor never shipped)
`credit_grant` appears nowhere in the official spec. Legacy `dashboard.openai.com/v1/dashboard/billing/credit_grants` is session-cookie-only and ToS-fragile — do not build on it. Remaining balance is dashboard-only (Billing → Credit grants, shows per-grant amount + expiry).

**Pattern for the finance dashboard:** store `granted` + grant date + expiry as constants; `left = granted − Σ costs since grant date` from `/v1/organization/costs`; recalibrate against the dashboard occasionally.

## Gotchas
- Community reports (late 2025–2026) of `/v1/organization/costs` 404ing for some orgs — enablement varies; ours is enabled as of 2026-07-03.
- Costs are gross usage; they do not net out credit application.
- The Admin key was pasted in chat during wiring; rotate before treating this as a long-lived production secret.

## Question → query cheat sheet
| Question | Endpoint |
|---|---|
| Daily spend | `GET /v1/organization/costs` (admin key) |
| Credit left | derive: granted − Σcosts (dashboard to calibrate) |
| Token usage | `GET /v1/organization/usage/completions` etc. |

## Known unknowns
- No official credit-grants API successor exists; grant total remains a dashboard/manual calibration while left is derived from costs.
