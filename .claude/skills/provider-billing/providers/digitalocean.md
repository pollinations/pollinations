# DigitalOcean billing via API

Validated: 2026-07-03 (live against our account with a `billing:read` PAT).

## Requirements
- REST only, no CLI needed (though `doctl` exists)
- Auth: PAT with **`billing:read`** scope (custom-scoped tokens supported — don't use full-access), from cloud.digitalocean.com/account/api

## Known identifiers (our account)
- ~$298/mo infra (droplets etc., not inference). Promo credit runs until **2026-07-22**, then cash.
- Monthly invoices arrive by email (harvested into the spend-audit `invoices/` tree).

## Querying balance and credits

### 1. Balance — `GET /v2/customers/my/balance` (live)
```bash
curl -s https://api.digitalocean.com/v2/customers/my/balance -H "Authorization: Bearer $DO_TOKEN"
```
- `account_balance` (string): most recent billing activity balance. **Negative = credit remaining** (real-world behavior; the spec only documents positive examples — keep an alert for the sign flipping positive = credits exhausted, now owing cash).
- `month_to_date_usage`: gross usage this billing period (before credit application).
- `month_to_date_balance` = `account_balance` + `month_to_date_usage`.

### 2. Granted amount — `GET /v2/customers/my/billing_history` (live; no active credit rows today)
`type` enum includes **`Credit`** and **`CreditExpiration`**. Sum `type=="Credit"` amounts (+ `description`, `date`) = total granted. Paginated (`links.pages.next`).

### 3. Credit expiry — NOT forward-readable
No `expires_at` anywhere; `CreditExpiration` rows appear only *after* forfeiture. Forward-looking expiry (2026-07-22 for us) is dashboard-only — hand-enter it.

### Live result, 2026-07-03

- `/v2/customers/my/balance` returns `account_balance=0.00` and `month_to_date_usage=0.00`.
- Full `billing_history` is readable, but current rows are invoices only; no `Credit` rows were present.
- Therefore the token is good and billing is readable, but there is no API-visible active credit/grant to overlay today.

## Gotchas
- All amounts are strings — parse.
- `month_to_date_usage` is gross before credits.

## Question → query cheat sheet
| Question | Endpoint |
|---|---|
| Credit left | `/v2/customers/my/balance` → `-account_balance` when negative |
| Granted total | Σ `type=Credit` in `/v2/customers/my/billing_history` |
| MTD spend | `/v2/customers/my/balance` → `month_to_date_usage` |
| Expiry | dashboard only (Billing → Credits) |

## Known unknowns
- Whether a future promo credit appears as negative `account_balance`, `type=Credit` in billing history, or only in the dashboard.
