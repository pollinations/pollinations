# Daytona billing — wallet endpoint exists, OIDC-only auth (undocumented)

Validated: 2026-07-03 (forager `dtn_` API key validates; billing wallet still blocked). Source of truth for paths: live OpenAPI at `https://app.daytona.io/api-json` + OSS repo `daytonaio/daytona` `libs/billing-api-client/`.

## Verdict
**Partially connectable.** Dollar credit balance is served by a separate, undocumented billing API that the dashboard calls with an Auth0 OIDC user token — not the documented `dtn_` API key. Usable but fragile.

Spend-audit connector status: `GET /api/api-keys/current` succeeds for key name `forager` and returns 16 permissions. `GET /api/organizations`, `/api/users/me`, and invitation discovery return `401 Invalid credentials`, so this key cannot discover the org id. Wallet left remains manual.

## Two API layers

### (a) Main API — documented, `dtn_` key; resource quota, NOT dollars
```bash
GET https://app.daytona.io/api/organizations/{organizationId}/usage   # verified 401 → exists
# Auth: Authorization: Bearer <dtn_ key> (+ X-Daytona-Organization-ID)
```
Returns `OrganizationUsageOverview` (snapshot/volume quota, per-region CPU/mem/disk/GPU usage). No credit figure.

### (b) Billing API — undocumented, separate host; the $ wallet
Host from `GET https://app.daytona.io/api/config` → `"billingApiUrl": "https://billing.app.daytona.io"`.
```bash
GET https://billing.app.daytona.io/v2/organization/{orgId}/wallet     # verified 401 → exists
#   → OrganizationWallet: balanceCents (credit incl. the $20k grant),
#     ongoingBalanceCents, billingType, creditCardConnected, automaticTopUp
GET .../v2/organization/{orgId}/usage       and .../usage/past?periods=12
GET .../v2/organization/{orgId}/invoices    # paginated
```
**Auth gotcha:** the dashboard sends the **Auth0 OIDC access token** (audience `https://api.daytona.work`, obtained via `daytona login`) — NOT the `dtn_` key. Undocumented surface; could change without notice.

## Our account
- $20k credit grant (of up to $75k program), manually read as left = granted on 2026-07-01.
- Harvested Daytona invoices are parsed for real usage burn; wallet top-ups are treated as funding, not compute cost.

## Recommendation
Read the wallet once from the dashboard now (grant unused → static). If auto-pull becomes worth it, either script `daytona login` token refresh (fragile) or ask Daytona for official API-key access to the billing API.

## Question → query cheat sheet
| Question | Path |
|---|---|
| Credit balance ($) | `GET billing.app.daytona.io/v2/organization/{orgId}/wallet` → `balanceCents` (OIDC token) |
| Resource quota/usage | `GET app.daytona.io/api/organizations/{orgId}/usage` (`dtn_` key) |
| Invoices | `GET billing.app.daytona.io/v2/organization/{orgId}/invoices` (OIDC token) |

## Known unknowns
- Whether a `dtn_` key will ever be accepted by `billing.app.daytona.io` (undocumented either way).
- Our `organizationId` (grab once from dashboard URL; `GET /api/organizations` rejects the current `dtn_` key).
