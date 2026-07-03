# io.net billing — dashboard-only (no supported API)

Validated: 2026-07-02 (endpoint existence probed live — internal endpoints return 401 unauthenticated; no API-key path exists).

## Verdict
**No supported programmatic balance/quota path.** The only documented public API is the OpenAI-compatible inference surface (consumes the grant, doesn't report it). Balance/credits are dashboard-only (IO ID page → "total IO Credits, remaining balance"; Usage & Billing → "Cloud $IO Balance").

## What exists

### Documented (inference only)
```bash
GET  https://api.intelligence.io.solutions/api/v1/models          # verified 200
POST https://api.intelligence.io.solutions/api/v1/chat/completions
# Auth: Authorization: Bearer <IO_API_KEY>
```
No `x-ratelimit-*` headers (verified) — remaining request quota not exposed even indirectly.

### Internal/undocumented (exist — verified 401 — but session-auth only)
- `GET https://api.io.solutions/v1/io-cloud/users/{userId}/balances` → `credits_balance`, `credits_withdrawable_balance`, `all_credits`, `credits_used`, `cloud_iocoin_balance`, `worker_balance`
- `GET https://api.intelligence.io.solutions/v1/stats/token-usage` and `.../token-credits-usage` (the 110M req/yr grant usage)
- Auth: WorkOS **session JWT** as custom `Token:` header + `Frontend-Version:` — browser-session-issued, short-lived, no programmatic mint. Fragile, unsupported — do not build on it.

## Our account
- Prepaid/cash pool ~$500 (spend-audit dashboard, hand-entered) + 110M req/yr grant on IO Intelligence.
- Cash paid via Wise 2026: $1,561.54.

## Recommendation
Keep manual (monthly dashboard read). Ask io.net partnerships/support for an API-key-authenticated balance endpoint — we're a grant recipient, so there's a relationship to leverage.

## Question → query cheat sheet
| Question | Path |
|---|---|
| Credit balance | dashboard only (io.net → IO ID / Usage & Billing) |
| Inference models | `GET api.intelligence.io.solutions/api/v1/models` |
