# AI Credits Platform

## Application Overview

The AI Credits Platform is **infrastructure for AI-powered applications** - providing authentication, AI proxy, and billing as a service that developers integrate into their own apps.

**Think of it like:**
- **Stripe** for payments → but for AI credits
- **Auth0** for authentication → but with built-in AI usage consent
- **OpenRouter** for AI routing → but with user-controlled model preferences

**The key insight:** Users discover and use apps through the developer's own channels. They only encounter our platform when they hit the login/auth flow. A user might use 10 different AI apps and never visit our website directly - they just benefit from having one account and one credit balance across all of them.

**The catalog/directory exists** but is secondary - a showcase and discovery aid, not the primary distribution channel for developers.

**Core Value Proposition:**

- **For Developers:** Infrastructure that removes all friction from building AI-powered tools. No backends, no API key management, no billing code. Plus, join a community of builders and get direct access to your user base.

- **For Users:** One account, one credit balance across every AI app you use. Daily free credits, full control over spending and model preferences. Create an account once, use it everywhere.

---

## Actors

### 1. **Anonymous Visitor**
- Can browse the app directory (if they find it)
- Can view landing page, documentation, legal pages
- Most users will never be "anonymous visitors" - they'll arrive via an app's auth redirect

### 2. **Registered User**
- Has an account (email/password or Google)
- Created their account during an app's OAuth flow (most common) or directly on our site (less common)
- Can authorize apps and set per-app usage limits
- Receives daily free credits (auto-claimed on first AI activity)
- Can configure model preferences (provider, cost tier)
- Can manage MCP groups (connect external tool servers)
- Can purchase credits or subscribe for higher daily bonuses
- Can choose to share profile info with apps they authorize

### 3. **Subscriber** (User with active subscription)
- All user capabilities
- Higher daily credit bonuses (500-2000 vs 100 for free)
- Priority support (Pro tier)
- Custom model preference overrides (Pro tier)

### 4. **Developer** (User who enabled developer mode)
- All user capabilities
- Can create OAuth clients (apps)
- Can generate app secret keys for server-to-server API calls
- Can optionally list apps in the directory
- Earns 50% revenue share on usage
- Can query list of users who authorized their app (via secret key)
- Part of the developer community
- Must accept Developer Agreement

### 5. **Admin**
- All capabilities
- Can review/approve apps for directory listing
- Can manage users and view platform analytics

---

## Authentication Architecture

### OAuth 2.1 + OpenID Connect

The platform implements **OAuth 2.1** (RFC 9068) with **OpenID Connect 1.0** for authentication and authorization.

#### Key OAuth 2.1 Requirements
- **PKCE required** for all clients (public and confidential)
- **Refresh token rotation** - new refresh token issued on each use
- **No implicit grant** - only authorization code flow
- **Exact redirect URI matching** - no wildcard or partial matches
- **Short-lived access tokens** (1 hour) with refresh tokens (30 days)

#### OpenID Connect Features
- **ID Token** - JWT containing user identity claims
- **UserInfo endpoint** - `/userinfo` for fetching user profile
- **Discovery document** - `/.well-known/openid-configuration`
- **JWKS endpoint** - `/.well-known/jwks.json` for token verification

#### Client Types

| Type | Description | Secret | PKCE | Use Case |
|------|-------------|--------|------|----------|
| **First-Party** | Platform's own apps (console) | Yes | Yes | Console client - no consent required |
| **Confidential** | Server-side apps | Yes | Yes | Traditional web apps with backend |
| **Public** | Client-side apps | No | Required | SPAs, mobile apps, CLI tools |

#### Token Types

| Token | Lifetime | Purpose |
|-------|----------|---------|
| **Authorization Code** | 10 minutes | Exchange for tokens (one-time use) |
| **Access Token** | 1 hour | API access (JWT, RS256 signed) |
| **Refresh Token** | 30 days | Obtain new access tokens (rotated on use) |
| **ID Token** | 1 hour | User identity claims (JWT) |

#### App Secret Keys (Client Credentials)

For server-to-server API calls (e.g., querying users), developers create **App Secret Keys**:

```
┌─────────────────────────────────────────────────────────────────┐
│                     AUTHENTICATION METHODS                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User Context (OAuth Access Token)                              │
│  ────────────────────────────────                               │
│  • Obtained via Authorization Code flow                         │
│  • Contains user identity + granted scopes                      │
│  • Used for: AI requests, user profile, MCP access              │
│  • Header: Authorization: Bearer <access_token>                 │
│                                                                 │
│  App Context (Secret Key)                                       │
│  ────────────────────────                                       │
│  • Generated in developer console                               │
│  • Identifies the app, not a user                               │
│  • Used for: User list, app analytics                           │
│  • Header: Authorization: Bearer <app_secret_key>               │
│            X-Client-ID: <client_id>                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Flows

### Flow 1: User Registration (Via App OAuth - Primary Path)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ User on     │───►│ Clicks      │───►│ Redirected  │───►│ No account? │
│ developer's │    │ "Login" or  │    │ to our auth │    │ Show signup │
│ app         │    │ uses AI     │    │ client      │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                │
                    ┌───────────────────────────────────────────┼───────────────────────────────┐
                    │                                           │                               │
                    ▼                                           ▼                               │
           ┌───────────────┐                           ┌───────────────┐                        │
           │  Email/Pass   │                           │    Google     │                        │
           │   Signup      │                           │    OAuth      │                        │
           └───────┬───────┘                           └───────┬───────┘                        │
                   │                                           │                                │
                   ▼                                           │                                │
           ┌───────────────┐                                   │                                │
           │ Verify Email  │                                   │                                │
           │  (code sent)  │                                   │                                │
           └───────┬───────┘                                   │                                │
                   │                                           │                                │
                   └─────────────────┬─────────────────────────┘                                │
                                     ▼                                                          │
                             ┌───────────────┐    ┌───────────────┐    ┌───────────────┐        │
                             │ Consent screen│───►│ User approves │───►│ Redirected    │◄───────┘
                             │ (scopes,      │    │ & sets limits │    │ back to app   │  (existing user)
                             │  limits)      │    │               │    │               │
                             └───────────────┘    └───────────────┘    └───────────────┘
```

**The key difference:** Most users create their account during an OAuth flow initiated by a third-party app, not by visiting our site directly.

**Steps:**
1. User is on a developer's app (developer's domain)
2. User clicks "Login" or triggers an AI feature
3. App redirects to our `/authorize` endpoint with PKCE challenge
4. If no account exists, user is prompted to sign up (email/password or Google)
5. User completes signup/verification
6. User sees consent screen with scopes and limit inputs
7. User approves, sets limits (e.g., "100 credits/day for LLM")
8. Authorization code generated, user redirected to app with code
9. App exchanges code + PKCE verifier for tokens at `/token`
10. **User may never see our site again** - they just use the app

**Pages:** `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password` `/authorize` (all on auth client)

---

### Flow 2: Console Login (First-Party OAuth)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ User visits │───►│ Redirected  │───►│ Login or    │───►│ Redirected  │
│ console.*   │    │ to auth.*   │    │ signup      │    │ to console  │
│             │    │ /authorize  │    │             │    │ (no consent)│
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**The console client is a first-party OAuth client:**
- Has `isFirstParty: true` flag on `OAuthClientEntity`
- Uses same OAuth 2.1 flow with PKCE
- **Skips consent screen** - user only needs to authenticate
- Automatically granted all user scopes

**Steps:**
1. User visits `console.example.com`
2. Console detects no session, redirects to `auth.example.com/authorize`
3. User logs in (or signs up)
4. No consent screen shown (first-party client)
5. User redirected back to console with tokens
6. Console stores tokens, user is logged in

---

### Flow 3: Returning User (Via App OAuth)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ User on a   │───►│ Clicks      │───►│ Already has │───►│ Consent     │
│ NEW app     │    │ "Login"     │    │ account +   │    │ (new app)   │
│             │    │             │    │ session     │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                │
                                                                ▼
                                                        ┌───────────────┐
                                                        │ Back to app   │
                                                        │ (authorized)  │
                                                        └───────────────┘
```

**The magic moment:** User created an account on App A. Weeks later, they try App B. They're already logged in (session cookie) → just consent and go. One account, works everywhere.

---

### Flow 4: Daily Credit Claim (Auto-Claim)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ User makes  │───►│ Check claim │───►│ Auto-claim  │───►│ Deduct for  │
│ AI request  │    │ eligibility │    │ if eligible │    │ request     │
│ (via app)   │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Steps:**
1. App makes AI request on behalf of user
2. System checks `CreditClaimEntity.nextAvailableAt`
3. If eligible (24h passed), auto-claim daily credits
4. Create `CreditTransactionEntity` (type: `daily_bonus`)
5. Update `CreditBalanceEntity.balance`
6. Proceed with AI request and deduct credits

**Manual Claim Option:**
- Users can also manually claim from `/dashboard` in console
- Claim button shows countdown to next available claim
- Same logic, just triggered by user instead of AI request

**Moving Window Logic:**
- 48-hour window for consecutive claims
- Miss a day → streak resets but can still claim
- Subscribers get higher daily amounts (500-2000 vs 100)

---

### Flow 5: OAuth Consent (App Authorization)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ App redirect│───►│  /authorize │───►│ User sets   │───►│ App receives│
│ to auth     │    │ (show app,  │    │ daily limits│    │ access_token│
│ (+ PKCE)    │    │  scopes)    │    │ per scope   │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Steps:**
1. Third-party app redirects user to `/authorize` with:
    - `client_id`, `redirect_uri`, `scope`, `state`
    - `code_challenge` + `code_challenge_method` (PKCE, required)
    - `response_type=code`
2. Auth service validates parameters
3. User sees consent screen showing:
    - App name, icon, developer
    - Requested scopes with clear descriptions:
        - **Identity scopes:** `openid`, `profile`, `email`
        - **AI scopes:** `llm`, `embeddings`, `image-generation`, `video-generation`, `mcp`
    - **Input fields for daily credit limits per AI scope**
4. User approves, sets limits (e.g., "100 credits/day for LLM")
5. System creates `OAuthClientConsentEntity` with `usageLimits`
6. Authorization code generated, user redirected to app
7. App exchanges code + `code_verifier` for tokens at `/token`

**Re-consent Triggers:**
- App requests new scopes not previously granted
- User revoked consent and app tries again
- Consent older than configured expiry (optional)

**Pages:** `/authorize` (auth client)

---

### Flow 6: AI Request (Credit-Consuming Operations)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ App calls   │───►│ Validate    │───►│ Check user  │───►│ Route to    │
│ /v1/chat/   │    │ token &     │    │ limits &    │    │ provider    │
│ completions │    │ scopes      │    │ balance     │    │ (OpenAI etc)│
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                                │
┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │
│ Return      │◄───│ Log usage   │◄───│ Deduct      │◄──────────┘
│ response    │    │ & earnings  │    │ credits     │
└─────────────┘    └─────────────┘    └─────────────┘
```

**Note:** This flow applies specifically to AI operations that consume credits. Other API calls (e.g., fetching user profile, listing MCP groups) do not cost credits.

**Steps:**
1. App sends AI request to external API with `Bearer` token
2. System validates token, extracts `userId`, `clientId`, scopes
3. Check daily limit for this app/scope not exceeded
4. Check user has sufficient credit balance
5. Parse capability request (e.g., `model: "capability:fast"`)
6. Apply user's model preferences to select actual model
7. Route request to appropriate provider
8. Calculate costs:
    - Raw cost (from provider pricing)
    - Platform share (50% of raw)
    - Developer share (50% of raw)
    - Total = 2x raw cost
9. Deduct from user's balance, log `ApiUsageEntity`
10. Credit developer's `pendingEarningsCents`
11. Return response to app

---

### Flow 7: Developer Registration

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ /developer  │───►│ Accept      │───►│ Fill company│───►│ Create      │
│ (console)   │    │ Developer   │    │ & payout    │    │ first app   │
│             │    │ Agreement   │    │ details     │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Steps:**
1. User navigates to `/developer` in console
2. Shown Developer Agreement, must accept
3. System creates `DeveloperEntity` linked to user
4. Developer fills optional company info, payout email
5. Can now create OAuth clients (apps)

**Pages:** `/developer` (console), `/developer-agreement` (public)

---

### Flow 8: App Creation & Secret Key Generation

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Create      │───►│ Get client  │───►│ Generate    │───►│ Integrate   │
│ OAuth       │    │ ID          │    │ secret keys │    │ into app    │
│ client      │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Steps:**
1. Developer creates OAuth client at `/developer/apps/new`:
    - Name, redirect URIs, client type (public/confidential)
    - Scopes needed (llm, embeddings, image-generation, etc.)
2. System generates `publicClientId`
3. For confidential clients: generate `clientSecret` (shown once)
4. Developer can create **App Secret Keys** for server-to-server calls:
    - Navigate to `/developer/apps/:id/keys`
    - Click "Create Secret Key"
    - Key shown once, stored hashed
    - Can have multiple keys (for rotation)
    - Keys can be revoked individually
5. Developer integrates OAuth + API into their app
6. **Optional:** Create directory listing for additional discovery

**Pages:** `/developer/apps`, `/developer/apps/new`, `/developer/apps/:id`, `/developer/apps/:id/keys` (console)

---

### Flow 9: Developer Queries User List

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Developer   │───►│ GET /v1/app/│───►│ Return      │
│ backend     │    │ users       │    │ user list   │
│ (secret key)│    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘
```

**Steps:**
1. Developer's backend calls `GET /v1/app/users` with secret key
2. System validates secret key, identifies the app
3. Returns paginated list of users who:
    - Have active consent for this client
    - Granted at least `openid` scope
4. Response includes fields based on granted scopes:
    - Always: `userId`, `authorizedAt`, `scopes`, `usageLimits`
    - If `profile`: `displayName`, `avatarUrl`
    - If `email`: `email`, `emailVerified`

**Use cases:**
- Send product updates to users
- Build user management in developer's own system
- Track user engagement outside the platform
- Sync users to CRM or email marketing tools

---

### Flow 10: Credit Purchase

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ /credits    │───►│ Select      │───►│ Stripe      │───►│ Credits     │
│ (console)   │    │ package     │    │ checkout    │    │ added       │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Note:** This is one of the few flows that requires users to visit our console directly.

**Steps:**
1. User visits `/credits` in console (or is directed there when balance is low)
2. Views current balance, selects credit package or subscription
3. Redirected to Stripe Checkout
4. On success, webhook fires
5. System creates `CreditPurchaseEntity` or `SubscriptionEntity`, plus `CreditTransactionEntity`
6. Balance updated

**Pages:** `/credits` (console)

---

### Flow 11: Subscription Management

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ /credits    │───►│ Select plan │───►│ Stripe      │───►│ Subscription│
│ (console)   │    │ (Basic/Pro) │    │ subscription│    │ active      │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Steps:**
1. User views plans at `/credits` in console
2. Selects Basic ($9.99/mo) or Pro ($29.99/mo)
3. Stripe subscription created
4. System creates `SubscriptionEntity`
5. Daily credit bonus increases (500 or 2000)
6. Recurring billing via Stripe webhooks

**Subscription Management (also on `/credits`):**
- View current plan and billing cycle
- Upgrade/downgrade plan
- Cancel subscription
- View invoices and payment history

**Pages:** `/credits` (console)

---

### Flow 12: MCP Group Setup

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ /mcp        │───►│ Create      │───►│ Add remote  │───►│ Tools cached│
│ (console)   │    │ group       │    │ MCP server  │    │ & available │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Steps:**
1. User creates MCP group (e.g., "travel-booking")
2. Adds remote MCP server:
    - Server URL
    - Auth type (none, bearer, api_key, oauth)
    - Credentials (encrypted)
3. System connects, caches available tools
4. When apps request `mcp` scope, they can access user's MCP groups

**Pages:** `/mcp` (console)

---

### Flow 13: App Discovery (Secondary Path)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ /directory  │───►│ /directory/ │───►│ Click       │───►│ Go to       │
│ (browse)    │    │ :appSlug    │    │ "Use App"   │    │ developer's │
│             │    │             │    │             │    │ site        │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Note:** This is a secondary discovery mechanism. Most users find apps through developer marketing, not our directory.

**Steps:**
1. User browses `/directory`, filters by tags
2. Clicks app to view details
3. Clicks "Use App" → **redirected to developer's site** (external URL)
4. OAuth flow happens from there

**Pages:** `/directory`, `/directory/:appSlug` (public client)

---

### Flow 14: Developer Payout

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Earnings    │───►│ Reach       │───►│ Request     │───►│ PayPal/Bank │
│ accumulate  │    │ minimum     │    │ payout      │    │ transfer    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Steps:**
1. Developer earns from app usage (50% of raw costs)
2. Earnings tracked in `DeveloperEntity.pendingEarningsCents`
3. When minimum reached (default €10), payout available
4. Developer requests payout at `/developer/payouts` in console
5. Admin processes via PayPal or bank transfer
6. `DeveloperPayoutEntity` created, earnings moved to `totalPaidCents`

**Pages:** `/developer/payouts`, `/developer/analytics` (console)

---

## API Endpoint Structure

### External API (api.example.com)

Endpoints are grouped by authentication context:

#### User Endpoints (OAuth Access Token)

These endpoints are called with a user's access token, obtained via OAuth flow.

```
Authorization: Bearer <user_access_token>
```

| Endpoint | Method | Scope Required | Credits | Description |
|----------|--------|----------------|---------|-------------|
| `/v1/me` | GET | `openid` | No | Get current user info |
| `/v1/chat/completions` | POST | `llm` | Yes | Chat completion (OpenAI-compatible) |
| `/v1/embeddings` | POST | `embeddings` | Yes | Generate embeddings |
| `/v1/images/generations` | POST | `image-generation` | Yes | Generate images |
| `/v1/videos/generations` | POST | `video-generation` | Yes | Generate videos |
| `/v1/mcp/groups` | GET | `mcp` | No | List user's MCP groups |
| `/v1/mcp/groups/:name/tools` | GET | `mcp` | No | List tools in MCP group |
| `/v1/mcp/groups/:name/call` | POST | `mcp` | Yes | Call MCP tool |

#### App Endpoints (App Secret Key)

These endpoints are called with an app secret key, for server-to-server operations.

```
Authorization: Bearer <app_secret_key>
```

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/app/users` | GET | List users who authorized this app |
| `/v1/app/users/:userId` | GET | Get specific user details |
| `/v1/app/analytics/usage` | GET | Get app usage analytics |
| `/v1/app/analytics/revenue` | GET | Get app revenue analytics |

#### OIDC Endpoints (Public)

Standard OpenID Connect discovery and token endpoints.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/openid-configuration` | GET | OIDC discovery document |
| `/.well-known/jwks.json` | GET | JSON Web Key Set |
| `/authorize` | GET | Authorization endpoint |
| `/token` | POST | Token endpoint |
| `/userinfo` | GET | UserInfo endpoint |
| `/revoke` | POST | Token revocation |

---

## Analytics Specifications

### User Analytics (Console `/dashboard`)

Based on `CreditTransactionEntity` and `ApiUsageEntity`:

| Metric | Source | Description |
|--------|--------|-------------|
| **Current Balance** | `CreditBalanceEntity.balance` | Real-time credit balance |
| **Daily Claim Status** | `CreditClaimEntity` | Next claim time, streak count |
| **Credits Used Today** | `CreditTransactionEntity` (type: usage, today) | Sum of today's usage |
| **Credits Used This Month** | `CreditTransactionEntity` (type: usage, this month) | Monthly usage total |
| **Top Apps by Usage** | `ApiUsageEntity` grouped by `clientId` | Which apps consume most credits |
| **Usage by Type** | `ApiUsageEntity` grouped by `apiType` | LLM vs embeddings vs images |
| **Recent Transactions** | `CreditTransactionEntity` (last 10) | Transaction history |

**Charts:**
- Line chart: Daily credit usage (last 30 days)
- Pie chart: Usage by API type
- Bar chart: Usage by app

---

### Developer Analytics (Console `/developer/analytics`)

Based on `ApiUsageEntity` and `DeveloperEarningsEntity`:

#### Overview Metrics

| Metric | Source | Description |
|--------|--------|-------------|
| **Total Revenue (All Time)** | `DeveloperEntity.totalPaidCents + pendingEarningsCents` | Lifetime earnings |
| **Pending Earnings** | `DeveloperEntity.pendingEarningsCents` | Available for payout |
| **Total Users** | Count of `OAuthClientConsentEntity` per developer's apps | Users who authorized any app |
| **Active Users (30d)** | `ApiUsageEntity` distinct `userId` in last 30 days | Monthly active users |
| **Total API Calls (30d)** | Count of `ApiUsageEntity` in last 30 days | Request volume |

#### Per-App Metrics

| Metric | Source | Description |
|--------|--------|-------------|
| **App Users** | `OAuthClientConsentEntity` for this `clientId` | Total authorized users |
| **App MAU** | `ApiUsageEntity` distinct `userId` for this `clientId` (30d) | Monthly active users |
| **App Revenue** | Sum of `ApiUsageEntity.developerShareCents` for this `clientId` | Revenue from this app |
| **Avg Revenue Per User** | App Revenue / App MAU | ARPU |
| **API Calls by Endpoint** | `ApiUsageEntity` grouped by `endpoint` | Which endpoints are used |
| **API Calls by Model** | `ApiUsageEntity` grouped by `model` | Which models are used |
| **Error Rate** | `ApiUsageEntity` where `statusCode >= 400` / total | Request success rate |
| **Avg Latency** | Avg of `ApiUsageEntity.latencyMs` | Response time |

#### Time-Series Charts

| Chart | Data |
|-------|------|
| **Revenue Over Time** | Daily `developerShareCents` (last 90 days) |
| **Users Over Time** | Daily new `OAuthClientConsentEntity` (last 90 days) |
| **API Calls Over Time** | Daily `ApiUsageEntity` count (last 30 days) |
| **Usage by Endpoint** | Stacked area chart of endpoint usage |

#### Filterable By

- Date range (7d, 30d, 90d, custom)
- App (if developer has multiple apps)
- Endpoint
- Model capability

---

### Admin Analytics (Console `/admin`)

Platform-wide metrics:

| Metric | Source | Description |
|--------|--------|-------------|
| **Total Users** | Count of `UserEntity` | Platform users |
| **Total Developers** | Count of `DeveloperEntity` | Registered developers |
| **Total Apps** | Count of `OAuthClientEntity` | Registered apps |
| **Listed Apps** | Count of `AppEntity` where `isListed = true` | Directory listings |
| **Daily Active Users** | Distinct `userId` in `ApiUsageEntity` (today) | DAU |
| **Monthly Active Users** | Distinct `userId` in `ApiUsageEntity` (30d) | MAU |
| **Total API Calls (24h)** | Count of `ApiUsageEntity` (24h) | Request volume |
| **Total Credits Used (24h)** | Sum of `ApiUsageEntity.creditsCharged` (24h) | Credit consumption |
| **Platform Revenue (24h)** | Sum of `ApiUsageEntity.platformShareCents` (24h) | Platform earnings |
| **Developer Payouts Pending** | Sum of `DeveloperEntity.pendingEarningsCents` | Outstanding payouts |
| **Free Budget Used Today** | `DailyFreeBudgetEntity.usedCents` | Abuse protection metric |

---

## Page Map

### Auth Client (auth.example.com)

The primary touchpoint for most users - they arrive here via OAuth redirects from apps.

| Route | Purpose | Access |
|-------|---------|--------|
| `/login` | Email/password login + Google OAuth | Public |
| `/signup` | User registration (email/password + Google) | Public |
| `/authorize` | OAuth authorization + consent with usage limits | Public (shows login if needed) |
| `/verify-email` | Email verification code entry | Public |
| `/forgot-password` | Request password reset | Public |
| `/reset-password` | Enter new password | Public (with token) |

**OAuth 2.1 / OIDC Endpoints:**

| Route | Purpose |
|-------|---------|
| `/.well-known/openid-configuration` | OIDC discovery document |
| `/.well-known/jwks.json` | Public keys for token verification |
| `/token` | Token endpoint (code exchange, refresh) |
| `/userinfo` | OIDC UserInfo endpoint |
| `/revoke` | Token revocation endpoint |

---

### Public Client (example.com)

Marketing site, documentation, and app directory. Many users may never visit this.

| Route | Purpose |
|-------|---------|
| `/` | Landing page - what it is, how it works, for developers, for users |
| `/directory` | App directory with search, tag filtering |
| `/directory/:appSlug` | App detail - description, screenshots, link to developer's site |
| `/docs` | Documentation hub (see content below) |
| `/terms` | Terms of Service |
| `/privacy` | Privacy Policy |
| `/developer-agreement` | Developer Agreement |
| `/cookie-policy` | Cookie Policy |

#### Documentation Content (`/docs`)

```
/docs
├── Getting Started
│   ├── What is [Platform]? - Infrastructure for AI apps explained
│   ├── For Users - One account, all AI apps, how credits work
│   └── For Developers - Why integrate, what you get
│
├── Building Your First App
│   ├── Quick Start - 10 minute integration tutorial
│   ├── Sample Apps - Reference implementations (React, Next.js, etc.)
│   └── Testing Your Integration - Sandbox mode, test credentials
│
├── OAuth Integration
│   ├── Overview - OAuth 2.1 + OIDC flow explained
│   ├── Scopes Reference - All available scopes explained
│   ├── Authorization Code Flow - With PKCE (required for all clients)
│   ├── Token Management - Access tokens, refresh tokens, rotation
│   ├── User Consent - How limits work, re-consent triggers
│   └── First-Party Clients - For platform integrations
│
├── API Reference
│   ├── Authentication
│   │   ├── User Context - OAuth access tokens
│   │   └── App Context - Secret keys for server-to-server
│   ├── User Endpoints
│   │   └── MCP Integration - /v1/mcp/*
│   ├── App Endpoints
│   │   ├── User Management - /v1/app/users
│   │   ├── Analytics - /v1/app/analytics/*
│   ├── Capability-Based Models - Request "fast" or "thinking"
│   └── Error Handling - Error codes, rate limits, quota errors
│
├── For Users
│   ├── Managing Your Account - Profile, settings, security
│   ├── Understanding Credits - Daily claims, purchasing, spending
│   ├── Authorized Apps - Viewing, adjusting limits, revoking
│   ├── Model Preferences - Choosing providers, cost tiers
│   └── Subscriptions - Plans and benefits
│
├── Developer Portal
│   ├── Creating Apps - OAuth client setup
│   ├── Secret Keys - Generating and managing API keys
│   ├── Managing Users - Querying your user base
│   ├── Analytics - Understanding your usage data
│   ├── Revenue & Payouts - How earnings work, requesting payouts
│   └── Directory Listing - Optional: getting your app listed
│
└── Resources
    ├── SDKs & Libraries - Official and community
    ├── Changelog - Platform updates
    └── Community - Discord, GitHub, support
```

---

### Console Client (console.example.com)

Account management for users and developers. Uses first-party OAuth (no consent required).

All routes require authentication via OAuth flow to auth client.

#### User Routes

| Route | Purpose |
|-------|---------|
| `/dashboard` | Credit balance, daily claim button, usage summary, quick stats |
| `/credits` | Billing: purchase credits, manage subscription, transaction history, invoices |
| `/apps` | Authorized apps - manage access, adjust limits, revoke |
| `/mcp` | MCP groups and remote server management |
| `/settings` | Account settings: profile (name, avatar), email, password, delete account |

#### Developer Routes

| Route | Purpose |
|-------|---------|
| `/developer` | Developer portal overview, "Become Developer" CTA (if not developer) |
| `/developer/apps` | List of developer's apps/OAuth clients |
| `/developer/apps/new` | Create new OAuth client |
| `/developer/apps/:id` | Edit app - OAuth settings, scopes, directory listing |
| `/developer/apps/:id/keys` | Manage app secret keys (create, view, revoke) |
| `/developer/apps/:id/users` | View users who authorized this app |
| `/developer/analytics` | Usage analytics, revenue breakdown (see Analytics section) |
| `/developer/payouts` | Earnings balance, payout history, request payout |
| `/developer/settings` | Company info, payout method, tax ID |

#### Admin Routes

| Route | Purpose |
|-------|---------|
| `/admin` | Admin dashboard - platform stats overview (see Analytics section) |
| `/admin/users` | User management - search, view details, suspend |
| `/admin/apps` | App review queue - approve, reject, request changes |
| `/admin/payouts` | Process developer payout requests |

---

## Summary Diagram

```
                                    ┌─────────────────────────────────┐
                                    │       AI CREDITS PLATFORM       │
                                    │   Infrastructure + Community    │
                                    └─────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TYPICAL USER JOURNEY                                  │
│                                                                                 │
│   Developer's       User clicks      Our auth         User returns    User uses │
│   website/app  ───► "Login" or  ───► (signup/    ───► to developer's ───► app   │
│   (their domain)    uses feature     consent)         app                       │
│                                                                                 │
│   [Most users never visit our main site - they just use apps]                   │
└─────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────┐
│                              PLATFORM SERVICES                                 │
│                                                                                │
│   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐            │
│   │   AUTH     │   │  INTERNAL  │   │  EXTERNAL  │   │    MCP     │            │
│   │ OAuth 2.1  │   │    API     │   │    API     │   │   PROXY    │            │
│   │   + OIDC   │   │  (Console) │   │            │   │            │            │
│   │  + Google  │   │            │   │            │   │            │            │
│   └────────────┘   └────────────┘   └────────────┘   └────────────┘            │
│         ▲                                  ▲                                   │
│         │                                  │                                   │
│         │              ┌───────────────────┴───────────────────┐               │
│         │              │                                       │               │
│         │              ▼                                       ▼               │
│         │    ┌──────────────────┐                   ┌──────────────────┐       │
│         │    │  User Endpoints  │                   │  App Endpoints   │       │
│         │    │  (Access Token)  │                   │  (Secret Key)    │       │
│         │    │                  │                   │                  │       │
│         │    │ • AI requests    │                   │ • User list      │       │
│         │    │ • MCP calls      │                   │ • Analytics      │       │
│         │    │ • User profile   │                   │                  │       │
│         │    └──────────────────┘                   └──────────────────┘       │
│         │                                                                      │
│   ┌─────┴──────────────────────────────────────────────────────────────┐       │
│   │              THIRD-PARTY APPS (Any domain)                         │       │
│   │   App A  •  App B  •  App C  •  App D  ...                         │       │
│   └────────────────────────────────────────────────────────────────────┘       │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                                FRONTENDS                                        │
│                                                                                 │
│   auth-client (auth.*)     │  console-client (console.*)  │  public-client      │
│   ─────────────────────    │  ────────────────────────    │  ──────────────     │
│   • Login/Signup           │  • Dashboard (balance/claim) │  • Landing page     │
│   • OAuth authorize        │  • Credits (billing)         │  • Documentation    │
│   • Email verification     │  • Apps (authorized)         │  • App directory    │
│   • OIDC endpoints         │  • MCP (groups/servers)      │  • Legal pages      │
│   • Forgot Password        │  • Settings (account)        │                     │
│                            │  • Developer portal          │                     │
│   [Uses session cookies]   │  • Admin panel               │                     │
│                            │                              │                     │
│                            │  [First-party OAuth client]  │                     │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                               AI PROVIDERS                                      │
│                    OpenAI  •  Anthropic  •  Google Vertex                       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Platform Positioning

| Like... | But... |
|---------|--------|
| **Stripe** (payment infrastructure) | For AI credits, not card payments |
| **Auth0** (auth infrastructure) | With built-in AI usage consent and limits |
| **OpenRouter** (AI routing) | With user-controlled preferences and per-app limits |

**The directory/catalog is:**
- A showcase, not the main storefront
- Secondary discovery, not primary user acquisition
- Optional for developers who want extra visibility
- A community hub showing what's being built

**The core value is infrastructure:**
- Users: One account → all AI apps
- Developers: Zero backend → full AI capabilities + user access + analytics