---
name: bring-your-own-pollen
description: Add Bring Your Own Pollen (BYOP) sign-in to an app so each user pays with their own Pollen instead of the app's key. Use when building an app, CLI, extension or agent tool on Pollinations and you need the user-authorized sk_ key, when you must choose between the OAuth code flow, the fragment flow and the device flow, or when an app key's usage must be attributed and monetized.
---
# bring-your-own-pollen — user-paid Pollinations apps

BYOP lets your users authorize your app to spend **their** Pollen. The app
sends users to the consent screen with a publishable **App Key** (`pk_...`)
and gets back a scoped user key (`sk_...`) for generation calls. The app
owner never pays for user usage, and users keep control of budget, expiry and
revocation.

Full reference: `https://gen.pollinations.ai/docs/llm.txt?section=byop` and
`https://enter.pollinations.ai/.well-known/oauth-authorization-server`.

## Pick the flow first

| Your app | Flow | Who exchanges the code |
| --- | --- | --- |
| Web app with a backend | OAuth authorization-code + PKCE | Backend (keeps secret) |
| Static / browser-only web app | OAuth authorization-code + PKCE | Browser via `fetch` (PKCE replaces the secret) |
| Legacy web app | Fragment redirect | No exchange; key arrives in `#api_key=` |
| CLI, bot, extension, anything headless | Device flow | The app polls the token endpoint |

If you are unsure, default to the **OAuth code flow with PKCE** for new web
work; it keeps `sk_...` out of the browser callback URL.

## Step 1 — App Key (`client_id`)

Create one at `https://enter.pollinations.ai/keys` → **Create New App Key**,
or via the API:

```bash
curl -X POST https://gen.pollinations.ai/account/keys \
  -H 'Authorization: Bearer sk_yoursecretkey' \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-app","type":"publishable","redirectUris":["https://myapp.com/callback"],"earningsEnabled":true}'
```

- `redirectUris` must match the callback **exactly**, query string included.
  Loopback `http://localhost` matches any port.
- `earningsEnabled: true` opts into developer earnings: users pay 25% over
  base rates and the markup credits **your** balance, in the same bucket the
  user paid from.

## Step 2 — OAuth code flow with PKCE

Build the auth link (generate a fresh verifier per attempt):

```text
https://enter.pollinations.ai/authorize
  ?response_type=code
  &client_id=pk_yourkey
  &redirect_uri=https://myapp.com/callback
  &scope=profile%20usage
  &state=random-csrf-token
  &code_challenge=BASE64URL_SHA256_VERIFIER
  &code_challenge_method=S256
```

Optional restrictions: `models=image,text` (or individual IDs),
`budget=10` (Pollen cap, default 5), `expiry=7` (days, default 7). The user
can narrow these on the consent screen.

Handle the callback — validate `state`, then exchange the single-use code
(10-minute TTL):

```bash
curl -X POST https://enter.pollinations.ai/api/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=authorization_code' \
  -d 'code=oauth_code' \
  -d 'client_id=pk_yourkey' \
  -d 'redirect_uri=https://myapp.com/callback' \
  -d 'code_verifier=YOUR_PKCE_VERIFIER'
# -> { "access_token": "sk_...", "token_type": "bearer", "expires_in": 604800, "scope": "profile usage" }
```

There are **no refresh tokens** — re-run the flow when the key expires.
Store the token in memory or `sessionStorage`; never in `localStorage`, a URL,
analytics or logs.

## Step 3 — Call the API with the user key

```javascript
await fetch('https://gen.pollinations.ai/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'openai/gpt-5.4-nano', messages: [{ role: 'user', content: 'yo' }] }),
});
```

Generation needs **no scope** — spending is bounded by the `budget` and
`expiry` the user approved. Scopes gate account data only:
`profile` (name + email), `usage` (balance + usage), `keys` (create/list/revoke keys).

## Device flow — the headless path

Use this for CLIs, bots and extensions that cannot show the consent page.

```bash
# 1. request a device code (pass client_id for attribution)
curl -X POST https://enter.pollinations.ai/api/device/code \
  -H 'Content-Type: application/json' \
  -d '{"client_id": "pk_yourkey"}'
# -> { "device_code": "...", "user_code": "ABCD-1234",
#      "verification_uri": "https://enter.pollinations.ai/device",
#      "verification_uri_complete": "https://enter.pollinations.ai/device?user_code=ABCD-1234",
#      "expires_in": 1800, "interval": 5 }

# 2. show verification_uri_complete to the user, then poll every `interval` seconds
curl -X POST https://enter.pollinations.ai/api/device/token \
  -H 'Content-Type: application/json' \
  -d '{"device_code": "..."}'
# pending -> { "error": "authorization_pending" }
# done    -> { "access_token": "sk_...", "token_type": "bearer" }
```

The same exchange is available at the standard endpoint with
`grant_type=urn:ietf:params:oauth:grant-type:device_code`.

## Fragment flow (legacy web)

```text
https://enter.pollinations.ai/authorize?redirect_uri=https://myapp.com/callback&client_id=pk_yourkey&scope=usage
```

The key returns in the URL fragment (`#api_key=sk_...&state=...`), so it never
hits server logs. On denial the fragment is `#error=access_denied`.

```javascript
const apiKey = new URLSearchParams(location.hash.slice(1)).get('api_key');
```

## Identify the key holder

```bash
curl https://enter.pollinations.ai/api/device/userinfo \
  -H 'Authorization: Bearer sk_...'
# -> { "sub": "user-id", "preferred_username": "voodoohop", "picture": "..." }
# with `profile` scope: also "name", "email"
```

## Checklist

- [ ] App Key created with the exact `redirect_uri` and `earningsEnabled` if you monetize.
- [ ] Fresh PKCE verifier + S256 challenge per attempt.
- [ ] `state` validated on the callback.
- [ ] Token kept in memory/`sessionStorage`; expiry handled by re-running the flow.
- [ ] Device flow used for headless apps, polling at the returned `interval`.
