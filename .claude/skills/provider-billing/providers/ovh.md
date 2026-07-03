# OVHcloud billing via API

Validated: 2026-07-03 (live pull wired in spend-audit).

## Requirements
- No CLI needed — plain REST against `https://eu.api.ovh.com/1.0`
- Auth: OVH application key + application secret + consumer key (create at https://eu.api.ovh.com/createToken/ — request read-only `GET /me/credit/*` and `GET /cloud/project/*/credit*` rights)
- Every request must be signed (`X-Ovh-Application`, `X-Ovh-Consumer`, `X-Ovh-Timestamp`, `X-Ovh-Signature` = SHA1 of secret+consumer+method+url+body+timestamp). Easiest via `python-ovh` (`pip install ovh`).

## Known identifiers (our account)
- €10,000 AI Endpoints voucher ("OVH voucher" pool in the spend-audit dashboard), expires 2027-01-07.
- Live 2026-07-03: €6,482.89 used / €3,517.01 left from `/me/credit/balance/STARTUP_PROGRAM`.
- AI Endpoints voucher is account-level `STARTUP_PROGRAM`, not Public Cloud project credit. The project credit endpoint only showed an expired €200 `FREETRIAL`.

## Querying credit balances

### 1. Account-level credit balances — `/me/credit/balance` (live)
```
GET /me/credit/balance                     → list of balance names
GET /me/credit/balance/{balanceName}       → amount per balance
GET /me/credit/balance/{balanceName}/movement → ledger of credits/debits (the "voucher ledger" we today read from PDFs)
```

### 2. Public Cloud project credits — `/cloud/project/{serviceName}/credit` (not the startup voucher)
```
GET /cloud/project                          → project IDs
GET /cloud/project/{serviceName}/credit     → cloud.Credit ids
GET /cloud/project/{serviceName}/credit/{id} → total_credit / used_credit / available_credit + validity window
```
For this account this only exposed an expired €200 `FREETRIAL`; do not use it for the OVH voucher dashboard row.

### 3. Invoices — `/me/bill` (untested)
`GET /me/bill?date.from=...` then `GET /me/bill/{billId}` for per-invoice detail; we currently collect these PDFs by email instead.

## Credit / discount handling
- OVH applies vouchers before charging the payment method; a month fully covered by voucher produces a €0 invoice (matches our "EUR0 cash, 100% voucher" observation).

## Gotchas
- Endpoint discovery: the full API schema is public JSON — `curl https://eu.api.ovh.com/1.0/me.json` / `.../cloud.json` and grep `path`. Useful before credentials exist.
- Use the **EU** endpoint (`eu.api.ovh.com`) — our account is OVH Europe (Ireland invoices `IE…`).

## Question → query cheat sheet
| Question | Endpoint |
|---|---|
| Voucher remaining (left) | `GET /me/credit/balance/STARTUP_PROGRAM` → `amount.value` |
| Voucher total (granted) | Sum `type=VOUCHER` movements under `/movement` |
| Voucher ledger (movements) | `GET /me/credit/balance/{name}/movement` |
| Invoice list | `GET /me/bill` |

## Known unknowns
- Whether `STARTUP_PROGRAM` updates in near-real-time or only when orders/invoices are generated.
