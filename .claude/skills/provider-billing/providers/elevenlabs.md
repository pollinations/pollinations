# ElevenLabs billing via API

Validated: 2026-07-02 (against live `api.elevenlabs.io/openapi.json` — ⚠️ NOT yet run authenticated; needs an admin/usage-scoped `xi-api-key`).

## Requirements
- Auth: `xi-api-key` header. Workspace analytics endpoints need a key from a workspace-admin user with usage/admin permission scopes (keys are permission-scoped).

## Known identifiers (our account)
- "3 months free, up to $3,300" grant — on-hold/not activated as of 2026-07-01, usage already exceeded it → currently treated as CASH in the spend audit. Cash paid via Wise 2026: $846.05 + invoices.

## Querying usage and subscription

### 1. Subscription / quota — `GET /v1/user/subscription`
```bash
curl -s https://api.elevenlabs.io/v1/user/subscription -H "xi-api-key: $ELEVENLABS_API_KEY"
```
Returns `tier`, `character_count` / `character_limit` (credits used/quota this cycle), `next_character_count_reset_unix`, `status`, `next_invoice` (`amount_due_cents`, `discount_percent_off`), `open_invoices[]`, `current_overage`.

### 2. Workspace fiat spend — `POST /v1/workspace/analytics/query/usage-by-product-over-time` ⭐
The admin usage API — supports `group_by` incl. **`fiat_currency`, `fiat_charge_type`**, `product_type`, `model`, `user_id`; `column_units` incl. **`usd`** and `credits`. Body: `start_time`/`end_time` in unix **milliseconds**, `interval_seconds` (86400 = daily).
Also `POST /v1/workspace/analytics/requests` for per-request logs (≤1000/page).

### 3. Deprecated — `GET /v1/usage/character-stats`
Still live in 2026 but deprecated ("use usage-by-product-over-time"); `metric` enum has `credits` and `fiat_units_spent`. Don't build new on it.

### 4. Grant balance — NO API
No endpoint exposes a remaining-USD grant figure, and no paid-invoice history endpoint (only `next_invoice`/`open_invoices`). Grant tracking = dashboard; burn derivable from the fiat analytics.

## Gotchas
- Analytics timestamps in **milliseconds** (min 2020-01-01).
- With a free grant active, `next_invoice.amount_due_cents` may read 0 while the grant burns.

## Question → query cheat sheet
| Question | Endpoint |
|---|---|
| USD spend over time | `POST /v1/workspace/analytics/query/usage-by-product-over-time` (group by fiat) |
| Character quota used/left | `GET /v1/user/subscription` |
| Grant remaining | dashboard only (derive from fiat analytics once grant activates) |

## Known unknowns
- Whether our current key has workspace-analytics permission (likely need a new admin-scoped key).
- Grant activation status (Elliot: activate/confirm the 3-month free program, then reclassify the pool from CASH to credit).
