# Wise (bank balances + cash position)

Validated: **2026-04-11** — profiles and balances endpoints queried live with a read-only token against the Myceli.AI OÜ business profile. Statement / transactions endpoints require SCA signing (documented below) and are not working from this skill yet.

This is the **cash position** piece of runway tracking: Stripe tells us what customers paid, Wise tells us what actually landed in our bank and what we still have available to spend. Pair with [stripe.md](stripe.md) / [polar.md](polar.md) on the revenue side and [aws.md](aws.md) / [azure.md](azure.md) / [gcp.md](gcp.md) / [umbrella-cost.md](umbrella-cost.md) on the cost side.

---

## Requirements

- **No Wise CLI** exists. A third-party `wise-cli` by jtrotsky (Go) exists but is incomplete and unmaintained. Use `curl` + `python3` directly against the REST API.
- A Wise **Business** account with 2FA enabled.
- A read-only personal API token (see "Generating a token" below).

## Secret handling — LOCAL FILE, NOT SOPS

Wise tokens are **NOT stored in the repo's SOPS vault**. They don't belong there because:

1. The deployed Cloudflare Worker does not need Wise data. This is purely a local FinOps tool.
2. Separating deploy secrets (SOPS) from local-analytics secrets (home dir) makes the blast radius of any leak smaller.
3. Read-only Wise tokens are lower risk than write-capable tokens but still benefit from least-privilege storage.

**Canonical location:**

```
apps/operation/finance/secrets/.env    (mode 0600, owner-only)
```

**First-time setup:**

```bash
mkdir -p ~/.config/pollinations-finops
chmod 700 ~/.config/pollinations-finops
touch apps/operation/finance/secrets/.env
chmod 600 apps/operation/finance/secrets/.env
$EDITOR apps/operation/finance/secrets/.env
```

Add the token:

```
# Wise read-only API token — Pollinations FinOps skill
# Generated via https://wise.com/settings/api-tokens
# Rotate at the same URL if leaked.
WISE_API_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Load before use:**

```bash
source apps/operation/finance/secrets/.env
curl -sS "https://api.wise.com/v2/profiles" -H "Authorization: Bearer $WISE_API_TOKEN"
```

Never print the raw value. Only confirm the prefix: `echo "${WISE_API_TOKEN:0:10}"` → should be a UUID-looking string.

**The same local file pattern can hold other non-deployed secrets in the future** — e.g. a Stripe read-only restricted key used only for runway analysis, future Mercury/Brex/etc. bank tokens, etc. Keep SOPS for secrets the Cloudflare Worker actually reads at runtime.

---

## Generating a token (one-time, ~3 min)

1. Log in to https://wise.com and make sure the **Business** profile is selected (not personal)
2. Go to https://wise.com/settings/api-tokens
3. Click **Create new token**
4. **Name**: `pollinations-finops-readonly` or similar
5. **Scope**: pick **Read only** — the FinOps skill never moves money, and Read scope avoids the SCA friction that Full access imposes on write calls
6. Complete the 2FA challenge (SMS / authenticator / email)
7. **Copy the token immediately** — it's shown once in a modal. If you close it before copying, delete the token and redo.
8. Store in `apps/operation/finance/secrets/.env` (see above). Do NOT put it in the repo's SOPS vault.

**To revoke/rotate**: same URL → click the token → Delete. Then create a new one and update the local file.

### Blast radius if leaked

| Can they… | Read-only token |
|---|---|
| See balances, profiles, recipient details | ✅ |
| See recent activity feed (`/activities`) | ✅ no SCA needed |
| See full statements (`/statement.json`) | ⚠️ requires SCA-signed keypair (below) |
| Create or approve transfers | ❌ |
| Change account settings | ❌ |

So a leaked read-only token is **information disclosure**, not financial theft. Still rotate if it leaks, but it's not an emergency.

---

## Known identifiers (Pollinations production)

```
User profile:         30958468  (type PERSONAL — Fouchy Elliot)
Business profile:     66415494  (type BUSINESS — Myceli.AI OÜ)
Business balances (2026-04-11):
  id=114623924  EUR   58,594.32   (STANDARD, primary operating balance)
  id=121011115  CAD        0.00   (STANDARD)
  id=114623925  GBP        0.00   (STANDARD)
  id=115634113  USD        0.00   (STANDARD)
Savings balances:     none
Secret location:      apps/operation/finance/secrets/.env → WISE_API_TOKEN
```

All real cash sits in the **EUR balance** (`114623924`). The zero-valued non-EUR balances exist for receiving foreign currency but get auto-converted or stay dormant.

---

## Auth

Bearer token in the Authorization header:

```bash
curl -sS "https://api.wise.com/v2/profiles" -H "Authorization: Bearer $WISE_API_TOKEN"
```

The `api.wise.com` host is **live** data. Sandbox lives at `api.sandbox.transferwise.tech` with its own separate token — irrelevant for this skill.

---

## Endpoint: Profiles

```bash
curl -sS "https://api.wise.com/v2/profiles" -H "Authorization: Bearer $WISE_API_TOKEN"
```

Returns an array of profiles (Wise users can have both personal and business profiles under one login). Each item has:

```
id                     int
type                   "PERSONAL" | "BUSINESS"
firstName / lastName   (personal)
fullName               (personal, computed)
businessName           (business)
details                nested address, company info
```

Use this once to capture the business `profileId`. Store it in your local secrets file alongside the token so you don't re-fetch:

```
WISE_API_TOKEN=...
WISE_BUSINESS_PROFILE_ID=66415494
```

## Endpoint: Balances ⭐

**The most useful endpoint for runway math.** Returns one row per currency you hold.

```bash
curl -sS "https://api.wise.com/v4/profiles/$WISE_BUSINESS_PROFILE_ID/balances?types=STANDARD" \
  -H "Authorization: Bearer $WISE_API_TOKEN"
```

Query param `types=` accepts `STANDARD` (main wallet) and `SAVINGS` (jar). You typically want STANDARD. Each row:

```
id               int         (needed for statement queries)
currency         "EUR" | "USD" | "GBP" | ...
amount.value     float       (available balance in that currency)
type             "STANDARD" | "SAVINGS"
visible          bool
reservedAmount   float       (pending, not yet available)
```

**Sum all STANDARD balances × each currency's FX rate to get your total cash position in a single unit** — you'll need the Wise rates endpoint or a separate FX source to normalize. For Pollinations (one real balance in EUR, zeros elsewhere), normalization is trivial.

## Endpoint: Activities (recent)

```bash
curl -sS "https://api.wise.com/v1/profiles/$WISE_BUSINESS_PROFILE_ID/activities?size=20" \
  -H "Authorization: Bearer $WISE_API_TOKEN"
```

Response shape:
```json
{
  "cursor": "<base64 token for next page>",
  "activities": [
    {
      "id": "<base64 encoded>",
      "type": "TRANSFER" | "CARD" | "CONVERSION" | "INTEREST" | ...,
      "resource": { "type": "TRANSFER", "id": "2068359631" },
      "title": "<strong>Recipient Name</strong>",
      "description": "Waiting for you to pay" | "Completed" | ...,
      "primaryAmount": "3,000 EUR",
      "secondaryAmount": "",
      "status": "REQUIRES_ATTENTION" | "COMPLETED" | "PENDING" | ...,
      "createdOn": "2026-04-09T15:42:28.845Z",
      "updatedOn": "2026-04-09T15:42:28.899Z"
    }
  ]
}
```

**Good enough for "recent outgoing/incoming transfers at a glance"** without needing SCA. The `title` is HTML with `<strong>` wrapping the name — strip it in post. The `resource.id` is the transfer/card/conversion ID you'd use to drill into a specific transaction via `/v1/transfers/{id}` etc.

**Paginate** with the `cursor` field: append `?cursor=<value>` to the next request. Typical size limit is 50-100 per page.

**Validated 2026-04-11**: the three most recent business activities were all outgoing EUR transfers with `status: REQUIRES_ATTENTION` — Wise's term for "quoted but not yet funded." Useful signal: these are pending spend commitments that will hit the balance soon.

## Endpoint: Balance statement (⚠️ SCA-gated)

```bash
curl -sS -i "https://api.wise.com/v1/profiles/$WISE_BUSINESS_PROFILE_ID/balance-statements/$BALANCE_ID/statement.json?currency=EUR&intervalStart=2026-03-01T00:00:00Z&intervalEnd=2026-04-01T00:00:00Z&type=COMPACT" \
  -H "Authorization: Bearer $WISE_API_TOKEN"
```

**Returns HTTP 403** with these headers (validated 2026-04-11):

```
x-2fa-approval-result: REJECTED
x-2fa-approval: 90d3daee-4920-4a77-8628-97f2c6e794b9
```

**This is Strong Customer Authentication (SCA)**, Wise's PSD2 compliance path. Even read-only tokens cannot fetch historical statements without completing the SCA challenge on each request. The flow:

1. First request returns 403 with `x-2fa-approval: <uuid>` header
2. You sign the UUID with a **private key** whose matching **public key** you pre-registered on your Wise account
3. Retry the same request with `X-Signature: <base64-signature>` and `X-2fa-Approval: <uuid>` headers
4. Wise now returns the statement

**Setup (one-time, not yet done for Pollinations)**:

1. Generate an RSA keypair locally:
   ```bash
   openssl genrsa -out ~/.config/pollinations-finops/wise-private.pem 2048
   openssl rsa -pubout -in ~/.config/pollinations-finops/wise-private.pem -out ~/.config/pollinations-finops/wise-public.pem
   chmod 600 ~/.config/pollinations-finops/wise-private.pem
   ```
2. Upload `wise-public.pem` at https://wise.com/settings/public-keys
3. On each 403, read the `x-2fa-approval` value and sign it:
   ```bash
   echo -n "$APPROVAL_UUID" | \
     openssl dgst -sha256 -sign ~/.config/pollinations-finops/wise-private.pem | \
     openssl base64 -A
   ```
4. Retry:
   ```bash
   curl -sS "https://api.wise.com/v1/profiles/$PID/balance-statements/$BID/statement.json?..." \
     -H "Authorization: Bearer $WISE_API_TOKEN" \
     -H "X-2fa-Approval: $APPROVAL_UUID" \
     -H "X-Signature: $SIGNATURE"
   ```

Docs: https://docs.wise.com/api-docs/features/strong-customer-authentication-2fa

**Until SCA is set up**, the `/activities` endpoint is the fallback for "what transactions happened" but it lacks the structured amount/fee/balance-after fields of the statement. For monthly reconciliation against Stripe payouts, SCA is required.

## Endpoint: Transfers list

```bash
curl -sS "https://api.wise.com/v1/profiles/$WISE_BUSINESS_PROFILE_ID/transfers?limit=20" \
  -H "Authorization: Bearer $WISE_API_TOKEN"
```

Each transfer has `id`, `user`, `targetAccount`, `sourceCurrency`, `sourceValue`, `targetCurrency`, `targetValue`, `status`, `rate`, `created`. Use this to see outgoing payments in structured form. **May also need SCA** for historical transfers — untested as of 2026-04-11.

---

## Question → query cheat sheet

| Question | Endpoint |
|---|---|
| Which Wise profiles do I have? | `GET /v2/profiles` |
| Current cash balance, all currencies | `GET /v4/profiles/{pid}/balances?types=STANDARD` |
| Total cash position in one currency | Sum balance.amount.value × FX rate |
| Recent transactions (any type) | `GET /v1/profiles/{pid}/activities?size=50` |
| Pending outgoing payments | Filter `/activities` where `status == "REQUIRES_ATTENTION"` |
| Full March 2026 statement | `GET /v1/profiles/{pid}/balance-statements/{bid}/statement.json?...` (⚠️ needs SCA) |
| Outgoing transfers detail | `GET /v1/profiles/{pid}/transfers` (⚠️ may need SCA) |

---

## Gotchas

- **SCA is mandatory for transactions / statements.** Profile and balance endpoints work with just Bearer token. Anything that touches individual transaction records requires the public/private keypair flow. Do not rely on `/statement.json` until SCA is set up.
- **Tokens are UUIDs**, not `sk_*` or `polar_oat_*` prefixes. You can't pattern-match them in a secret scanner as easily — be strict about where they're stored.
- **Rate limit**: 100 requests per 10 seconds per token. Plenty for runway queries; don't build a polling dashboard against it.
- **Business vs personal profile**: a Wise login often has both. Always verify `type == "BUSINESS"` before querying balances — querying the personal profile returns personal finances which are NOT what you want.
- **Currency object shape**: balances return `{currency: "EUR", amount: {value: 58594.32, currency: "EUR"}}`. The amount has its own nested currency field (same as outer). Don't trip on that.
- **Activity `title` is HTML** with `<strong>` tags. Strip them before display.
- **Activities "REQUIRES_ATTENTION" does NOT mean failed** — it means "quoted but user hasn't paid/funded yet". These are pending outgoing spend commitments. Filter by this status to see what's about to hit the balance.
- **Zero-balance currencies still appear** in the balances response. Filter `amount.value > 0` if you only want real holdings.
- **Don't put this token in SOPS**. It's a local-analytics secret; the Worker doesn't need it. Use `apps/operation/finance/secrets/.env` instead.

---

## Known unknowns

- **SCA keypair not yet registered** — blocks `/balance-statements/` and possibly `/transfers/`. To enable, follow the SCA setup in the "Balance statement" section above. Without it, we only have aggregate balances (no transaction-level detail).
- **Card transactions** — Wise business account has debit cards. If we use them for SaaS subs or expense purchases, those show in `/activities` as `type: "CARD"`. Unverified whether we have any such transactions; check once with `activities?size=100` and filter.
- **Multi-currency normalization** — we don't have a single source of truth for the EUR/USD rate to use when adding balances across currencies. Wise has `/v1/rates?source=EUR&target=USD` but hitting it on every report is wasteful. For now, normalize to EUR using whatever the main FX source is (ECB, or just trust that non-EUR balances will be ~zero).
- **Reconciliation with Stripe payouts** — Stripe payouts are supposed to land as incoming transfers in Wise. Without statements, we can't cross-check the timing/amount. SCA setup is the unblocker.
- **Savings jars (STANDARD vs SAVINGS)** — we have no savings balances as of 2026-04-11. If savings ever gets used, need to query both `types` and sum.

---

## Session 1 validation log (2026-04-11)

| Command | Result |
|---|---|
| `GET /v2/profiles` | ✅ 2 profiles (personal + business) |
| `GET /v4/profiles/66415494/balances?types=STANDARD` | ✅ 4 balances: €58,594.32 EUR + 0 in CAD/GBP/USD |
| `GET /v4/profiles/66415494/balances?types=SAVINGS` | ✅ empty array — no savings jars |
| `GET /v1/profiles/66415494/activities?size=5` | ✅ 5 recent activities, all TRANSFER type, outgoing pending |
| `GET /v1/profiles/66415494/balance-statements/.../statement.json` | ❌ 403 with `x-2fa-approval-result: REJECTED` — needs SCA keypair |

**Cash position captured**: **€58,594.32** in main EUR balance. Paired with Stripe balance of €3,758 (see [stripe.md](stripe.md)), **total liquid cash visible from these two sources = ~€62,352** as of 2026-04-11. Not a full cash position (missing any other banks, yet-to-land AWS/Azure bills, etc.) but a solid starting point for runway math.
