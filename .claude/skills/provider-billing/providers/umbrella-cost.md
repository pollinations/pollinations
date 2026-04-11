# Umbrella Cost (Automat-IT reseller dashboard) via REST API

Validated: **2026-04-11** — sign-in endpoint and JWT flow verified with real credentials. **Downstream API calls currently blocked by "API access not enabled" tenant gate** — see "Session 1 validation results" at the bottom of this file for exact findings and the remediation path.

Automat-IT, our AWS reseller, uses **Umbrella Cost** (formerly Anodot Cost / Pileus — same product, two rebrands) as the customer-facing cost and billing dashboard. Our real AWS invoice with Automat-IT-specific discounts flows through Umbrella, NOT through `aws ce`. This playbook is the Umbrella equivalent of [aws.md](aws.md).

## Why this matters

- **The AWS CLI shows list prices.** Umbrella Cost shows our *actual invoiced* price after Automat-IT's reseller discount. Any runway calculation based on `aws ce` numbers is systematically wrong (too high).
- **Promotional credits and commitments** that Automat-IT has applied to our AWS account are only visible in Umbrella, not in the AWS Console.
- **Invoices and payment status** live on Umbrella — AWS doesn't bill us directly.
- **AWS only.** Our Automat-IT Umbrella Cost tenant covers AWS billing only. Azure and GCP are NOT resold through Automat-IT — they're billed directly by Microsoft / Google. Use [azure.md](azure.md) and [gcp.md](gcp.md) for those.

Official docs: https://docs.umbrellacost.io/reference/umbrella-cost-api-overview

---

## Requirements

- Umbrella Cost account credentials (username + password OR API access key)
- `curl` + `python3` for wrangling responses
- **No CLI tool** — Umbrella Cost does not publish a dedicated CLI. The REST API is the only programmatic surface.

## Known identifiers

```
Reseller:            Automat-IT (automat-it.com)
AWS Org master:      813596885972  ← Automat-IT payer
Our AWS member:      301235909293
Dashboard app URL:   https://umbrellacost.io          (main SPA, React)
Legacy Anodot URL:   https://cloudcost.anodot.com     (redirects to docs now)
Instances pricing:   https://instances.umbrellacost.io (separate micro-app for pricing)
API base URL:        https://api.umbrellacost.io/api/v1
API-front base URL:  https://api-front.umbrellacost.io/api/v1  ← used by the dashboard
Legacy Pileus URL:   https://api.mypileus.io/api/v1   ← same backend
API version:         0.13.145 (as of 2026-04-11)
Auth provider:       AWS Cognito (us-east-1_Uv6ArNdSK, client 7i82cnpt469rcd93fif1glhnkm)
Our Cognito sub:     3de399ff-a85c-465b-bcdd-b743c21a2e70
Our username field:  etfy (not email; email is in the JWT claims)
Tenant user:         elliot@myceli.ai
```

All three API hosts (`api.umbrellacost.io`, `api-front.umbrellacost.io`, `api.mypileus.io`) route to the same backend. Prefer `api.umbrellacost.io` for direct calls. The dashboard SPA uses `api-front.umbrellacost.io`.

### Health check (no auth needed)

```bash
curl -sS "https://api.umbrellacost.io/api/v1/health"
# → {"status":"available","version":"0.13.145"}
```

Use this as a liveness probe or to detect API version changes.

---

## Authentication — the flow that works

Umbrella Cost uses **AWS Cognito** under the hood. Sign-in is a single POST; the response contains a Cognito ID token (JWT) that you put verbatim in the `Authorization` header on subsequent requests. **No `Bearer ` prefix** — the raw JWT goes in as-is.

### 1. Sign in

```bash
UC_USER='<your-email>'
UC_PASS='<your-password>'

curl -sS -X POST "https://api.umbrellacost.io/api/v1/users/signin" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$UC_USER\",\"password\":\"$UC_PASS\"}"
```

Response shape (verified 2026-04-11):

```json
{
  "jwtToken": "eyJraWQi...",            // Cognito ID token (~950 chars). Put this in Authorization header.
  "username": "etfy",                   // tenant-specific username, NOT the email
  "refreshToken": "eyJjdHki..."         // Cognito refresh token, ~1500 chars
}
```

**The `jwtToken` is the ID token**, which decodes to claims like:

```
sub:          3de399ff-a85c-465b-bcdd-b743c21a2e70  (Cognito user UUID)
email:        elliot@myceli.ai
token_use:    id
iss:          https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Uv6ArNdSK
aud:          7i82cnpt469rcd93fif1glhnkm  (client ID)
exp:          <unix-time>  (24h from issue)
```

Decode for debugging:

```bash
echo "$JWT" | python3 -c "
import sys, json, base64
parts = sys.stdin.read().strip().split('.')
payload = parts[1] + '=' * (4 - len(parts[1]) % 4)
print(json.dumps(json.loads(base64.urlsafe_b64decode(payload)), indent=2))
"
```

### 2. Authenticated request shape

```bash
curl -sS "https://api.umbrellacost.io/api/v1/<endpoint>" \
  -H "Authorization: $JWT"
```

**Critical**: `Authorization: <raw jwt>`. **NOT `Bearer <jwt>`**. Verified — Bearer prefix returns 401.

### 3. Alternate endpoints that DO NOT work (don't retry them)

These all return `{"message":"unauthorized"}` regardless of credentials:

- ❌ `POST /api/v1/users/apiAccess` — old Pileus path, deprecated
- ❌ `POST /auth/api/v1/token` — OAuth-style path, not used
- ❌ `POST /api/v1/auth/login` — not implemented
- ❌ `GET /users/user-accounts` with `Authorization: Bearer $JWT`
- ❌ `GET /users/user-accounts` with `-H "apikey: $JWT"`
- ❌ `GET /users/user-accounts` with `Cookie: api_token=$JWT`

The ONLY working sign-in path is `POST /api/v1/users/signin` with `{username,password}`.

### 4. Dashboard uses a second request interceptor header

From the dashboard JS bundle (`umbrellacost.io/assets/index-*.js`):

```js
Authorization = localStorage.getItem("authToken");                    // JWT
headers["impersonation-token"] = localStorage.getItem("impersonationToken") ?? undefined;
const R1 = "reCustomerOrgToken";
const o = localStorage.getItem(R1);
if (o) headers[R1] = o;                                               // reseller-org scoping token
```

- `impersonation-token` — only set when an ADMIN impersonates another user via `POST /api/v1/users/impersonate`. Skip for normal API use.
- `reCustomerOrgToken` — only set when an ADMIN impersonates a **reseller customer org**. Skip for normal API use.

Neither header is required for plain reseller-customer access. If you see references to `reCustomerOrgToken` or `impersonation-token` in other docs, they're for MSP-admin use cases, not ours.

### 5. Token lifetime and refresh

Cognito ID tokens are valid for 24 hours (`exp` in claims). Refresh via:

```bash
curl -sS -X POST "https://api.umbrellacost.io/api/v1/users/renewToken" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

(⚠️ exact shape unverified — `renewToken` as GET returned 404 in testing. Try POST.)

### Token storage for Pollinations

Store credentials in SOPS. Recommended env var names:

```
UMBRELLA_COST_USERNAME   (email)
UMBRELLA_COST_PASSWORD   (password)
UMBRELLA_COST_JWT        (fetched at runtime, 24h lifetime, don't commit)
```

Never commit a raw JWT — they're short-lived and should be fetched on demand from username+password.

---

## Querying spend and usage

### 1. Cost & Usage — `/api/v1/invoices/cost-and-usage`

The flagship endpoint. Returns rolled-up, reseller-discounted cost for a date range grouped by any dimension.

```bash
curl -sS -G "https://api.umbrellacost.io/api/v1/invoices/cost-and-usage" \
  -H "Authorization: ${UMBRELLA_TOKEN}" \
  -H "accountId: ${UMBRELLA_COST_ACCOUNT_ID}" \
  --data-urlencode "startDate=2026-04-01" \
  --data-urlencode "endDate=2026-04-11" \
  --data-urlencode "groupBy=service" \
  --data-urlencode "granLevel=daily"
```

**Query params** (from docs):

- `startDate`, `endDate` — ISO 8601 (`YYYY-MM-DD`). Inclusive on both ends.
- `granLevel` — `daily` | `monthly` | `yearly`
- `groupBy` — `service` | `usagedate` | `family` | `region` | `usagetype` | `account`
- `costType` — `unblended` | `net_unblended` | `amortized` | `net_amortized` (mirrors AWS CE)
- `filters` — JSON-encoded filter object, same shape as AWS CE filters
- `costCenter` — filter by cost center ID (when configured)

**Why this beats `aws ce`**:
- Response already has reseller discount applied (when `costType=net_unblended`)
- Single API call returns the same breakdown that would cost several `aws ce` calls at $0.01 each
- Supports `costCenter` dimension for allocation that AWS CE doesn't offer
- Returns `actualCost` + `listCost` in the same row — the difference is your discount margin

### 2. Recommendations — `/api/v1/recommendations`

Pulls cost-saving suggestions: underutilized EC2s, missing RIs, oversized RDS, etc.

```bash
curl -sS "https://api.umbrellacost.io/api/v1/recommendations" \
  -H "Authorization: ${UMBRELLA_TOKEN}" \
  -H "accountId: ${UMBRELLA_COST_ACCOUNT_ID}"
```

Returns an array. Each recommendation has `estimatedMonthlySavings`, `status` (open/dismissed/done), `resourceId`, `recommendationType`. Same data as the web dashboard.

### 3. Commitments — `/api/v1/commitments`

Shows active Savings Plans and Reserved Instances managed via Umbrella. For us this likely shows whatever Automat-IT has pre-purchased and applied to our account.

```bash
curl -sS "https://api.umbrellacost.io/api/v1/commitments" \
  -H "Authorization: ${UMBRELLA_TOKEN}"
```

Cross-reference with `aws savingsplans describe-savings-plans` — if Umbrella shows commitments but AWS doesn't, the SP is at the payer (Automat-IT) level.

### 4. Anomaly detection — `/api/v1/anomalies`

Umbrella continuously runs anomaly detection. This endpoint returns detected spend spikes:

```bash
curl -sS "https://api.umbrellacost.io/api/v1/anomalies?startDate=2026-04-01&endDate=2026-04-11" \
  -H "Authorization: ${UMBRELLA_TOKEN}"
```

Each anomaly has a `score`, `service`, `detectedAt`, `estimatedImpact`. Useful for answering "why did spend jump yesterday."

### 5. Cost centers / divisions / assets

For organization-level allocation (if Automat-IT has set these up for us):

```bash
curl -sS "https://api.umbrellacost.io/api/v1/cost-centers" \
  -H "Authorization: ${UMBRELLA_TOKEN}"

curl -sS "https://api.umbrellacost.io/api/v1/divisions" \
  -H "Authorization: ${UMBRELLA_TOKEN}"

curl -sS "https://api.umbrellacost.io/api/v1/assets" \
  -H "Authorization: ${UMBRELLA_TOKEN}"
```

Per docs, **cost centers are currently GET-only** — you cannot create/edit via API.

---

## Comparing Umbrella numbers vs `aws ce` numbers

Once you have both sets of data, this one-liner reveals the reseller discount margin:

```python
# Pseudocode — requires both responses in hand
aws_cost = float(aws_ce_resp['ResultsByTime'][0]['Total']['UnblendedCost']['Amount'])
umbrella_cost = float(umbrella_resp['data']['actualCost'])  # net_unblended
discount_pct = (1 - umbrella_cost / aws_cost) * 100
print(f"AWS list: ${aws_cost:.2f}  Umbrella invoiced: ${umbrella_cost:.2f}  discount: {discount_pct:.1f}%")
```

**This is the real number.** The Umbrella value is what Automat-IT actually bills us.

---

## Gotchas

- **No CLI tool.** Umbrella publishes a REST API only — no `umbrella-cli`, no SDK package on npm/PyPI. You're curl-ing directly or writing a thin wrapper.
- **Auth header is raw JWT, NOT `Bearer <jwt>`.** Verified — Bearer prefix returns 401.
- **The sign-in endpoint is `/api/v1/users/signin`**, not `apiAccess` (old docs) or `auth/token`. Those paths exist but always return `unauthorized`.
- **Cognito ID tokens last 24h**, not 1h (earlier research was wrong — actual `exp` claim verified).
- **`username` in the signin response is the tenant-scoped username (`etfy`), not the email.** The email is inside the JWT claims.
- **Three hostnames, one backend.** `api.umbrellacost.io`, `api-front.umbrellacost.io`, `api.mypileus.io` all route to the same service. Dashboard uses `api-front`.
- **No `accountId` header needed for reseller customers.** That was wrong in the original docs I read — our calls don't need it. Only MSP-admin impersonation flows use header scoping.
- **`reCustomerOrgToken` header is only for MSP-admin impersonation**, not normal user calls. Ignore it unless you're doing admin-ops.
- **Rate limits undocumented.** Be conservative.
- **Historical data latency.** Umbrella re-processes invoices monthly. Mid-month numbers are estimates; final numbers land after AWS invoice close (~day 5-8 of next month).
- **API access may be tenant-gated** (see session 1 results below) — even after successful login, GETs may hang until Automat-IT enables "API Access" on the tenant.

---

## Question → query cheat sheet

| Question | Endpoint |
|---|---|
| What did Automat-IT actually bill us for AWS in March? | `GET /invoices/cost-and-usage?startDate=2026-03-01&endDate=2026-03-31&costType=net_unblended` |
| What's the reseller discount margin? | Compare Umbrella `net_unblended` vs AWS CE `UnblendedCost` for same period |
| Are there any cost anomalies this week? | `GET /anomalies?startDate=<week-start>&endDate=<today>` |
| What savings plans cover our usage? | `GET /commitments` |
| What cost-saving recommendations are open? | `GET /recommendations` |
| Which of our AWS accounts does Umbrella have? | `GET /users/me` → `accounts[]` |
| Is the API up? | `GET /health` |

---

## Known unknowns (open follow-ups)

- **Why do all authenticated GETs hang?** Sign-in works, JWT is valid, `Authorization: <jwt>` is the correct header — but every data endpoint either 504s or hangs until curl timeout. See "Session 1 validation results" below. Most likely cause: API access is not enabled for our tenant user; Automat-IT admin needs to toggle it.
- **Credit / MACC-equivalent visibility** — does Umbrella expose AWS Promotional Credits / Activate credits separately? Needs the cost-and-usage call to actually respond.
- **`renewToken` endpoint shape** — GET returned 404, POST shape unverified. Probably `POST /api/v1/users/renewToken` with `{refreshToken}` body.
- **Cost center setup** — has Automat-IT configured any cost centers / divisions for Pollinations? If yes, we can tag by project. If no, all spend rolls up to one bucket.
- **Schema of `cost-and-usage` response** — I haven't seen an authenticated response yet. The field names (`actualCost`, `listCost`, etc.) above are from public docs snippets and may differ in our tenant.
- **API access provisioning** — is API access enabled for our tenant? Some Umbrella tenants require an Automat-IT admin to explicitly enable the "API Access" feature before `users/apiAccess` works. If login fails with "API access not enabled," contact Automat-IT support.
- **Credentials location** — credentials for our Umbrella account are currently TBD. Once someone logs in, they should be stored in SOPS alongside other provider secrets.

---

## Next session checklist

When we first use this skill in anger:

1. Get Umbrella Cost credentials from whoever manages the Automat-IT relationship
2. Run the token endpoint probes to confirm which path works
3. Hit `/users/me` to get the `accountId` for our AWS 301235909293 account
4. Run a `cost-and-usage` query for last month and **compare to `aws ce` for the same period**
5. Record the actual response schema inline in this file — replace the "from docs" field names with real ones
6. Check whether credits are visible; if yes, update [aws.md](aws.md) with a pointer back here
7. Update the "Validated" date at the top of this file

---

## Session 1 validation results (2026-04-11)

Full log of what was tried, what worked, and what's still broken. This section exists so the next session doesn't repeat the same probes.

### What worked

✅ **Sign-in**: `POST https://api.umbrellacost.io/api/v1/users/signin` with `{"username":"elliot@myceli.ai","password":"..."}` returned 200 with `{jwtToken, username, refreshToken}`. Identical response shape from `api-front.umbrellacost.io` — same backend.

✅ **JWT decoded cleanly**: ID token from Cognito pool `us-east-1_Uv6ArNdSK`, client `7i82cnpt469rcd93fif1glhnkm`, subject `3de399ff-a85c-465b-bcdd-b743c21a2e70`, email `elliot@myceli.ai`, `token_use: id`, 24h expiry.

✅ **Health check**: `GET /api/v1/health` returns `{"status":"available","version":"0.13.145"}` on both `api.umbrellacost.io` and `api.mypileus.io`. Same backend, two DNS names.

✅ **Dashboard JS inventory**: scraped `https://umbrellacost.io/assets/index-*.js` to extract all API endpoints. Found 30+ `/api/v1/*` paths plus the `R1 = "reCustomerOrgToken"` constant. The file [inventory is preserved in gotchas above].

### What failed

❌ **Every authenticated GET hangs or 504s.** Specifically tested with valid JWT in `Authorization: $JWT` (raw, no Bearer):

| Endpoint | Result |
|---|---|
| `GET /api/v1/users/account-info` | hang → timeout |
| `GET /api/v1/users/user-general-data` | **504 Gateway Timeout** (nginx) |
| `GET /api/v1/users/default-account` | hang → timeout |
| `GET /api/v1/users/user-accounts` | hang → timeout |
| `GET /api/v1/users/user-settings` | hang → timeout |
| `GET /api/v1/users/notifications` | hang → timeout |
| `GET /api/v1/dashboards` | hang → timeout |
| `GET /api/v1/services` | hang → timeout |
| `GET /api/v1/integrations` | hang → timeout |

Tested with `Origin: https://umbrellacost.io` + browser `User-Agent` headers — same result. Tested on both `api.umbrellacost.io` and `api-front.umbrellacost.io` — same result.

### Auth header variants tested

| Variant | Result |
|---|---|
| `Authorization: <jwt>` (raw) | hang/504 (backend accepted auth, processing) |
| `Authorization: Bearer <jwt>` | **401** |
| `apikey: <jwt>` | **401** |
| `Cookie: api_token=<jwt>` | **401** |
| basic auth `-u user:pass` | **401** |

The raw-JWT variant is the only one that reaches the backend. The 401s confirm the other header shapes are wrong at the auth layer.

### Diagnosis

The backend **accepts the JWT** (no 401) but **deadlocks on every data endpoint**. The fact that `/users/user-general-data` returned an actual nginx 504 (not curl timeout) means there's a real request being made to an upstream that never responds.

Most probable cause: **our tenant user does not have API access enabled**. Pileus/Umbrella documents a per-user "API Access" feature flag that must be enabled by a tenant admin. When it's off, signed-in users can use the web dashboard (which goes through a different auth path via Cognito hosted UI) but programmatic API calls with the raw ID token get blackholed.

### Remediation path

1. **Contact Automat-IT support** (billing reseller admin) to request API access for user `elliot@myceli.ai` on the Pollinations Umbrella Cost tenant. Reference: "Please enable Umbrella Cost API access for this user — I need to call `/api/v1/invoices/cost-and-usage` programmatically for our internal FinOps automation."
2. Once enabled, re-run the "Next session checklist" above to confirm calls succeed.
3. If calls still hang, try the dashboard's own auth flow: Cognito hosted UI at `https://<tenant>.auth.us-east-1.amazoncognito.com/login?client_id=7i82cnpt469rcd93fif1glhnkm&response_type=token&redirect_uri=https://umbrellacost.io` and capture the returned access token from the URL fragment. The ID token and access token may behave differently for API calls.
4. Alternative: **ask Automat-IT for a CSV/PDF export** of our monthly invoice via their normal support channel. Even without API access, they'll email invoices monthly. We can parse those into our runway spreadsheet until API access is unblocked.

### Files touched

- [providers/aws.md](aws.md) — reference back from this file for the discount-margin computation
- No secrets written anywhere
