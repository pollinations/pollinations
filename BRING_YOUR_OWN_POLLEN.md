BYOP (Bring Your Own Pollen) lets your users authorize your app to spend their own Pollen on Pollinations requests. Your publishable App Key (`pk_...`) identifies the app; after approval, Pollinations returns a scoped user key (`sk_...`) for API calls.

Users stay in control of their balance, budgets, and revocation; your app never has to pay for their usage.

## 🗝️ App Key

An **App Key** (`pk_...`) is the publishable key your app sends users to Pollinations with. Without one, the consent screen falls back to the redirect hostname and traffic isn't attributed to your account.

To create one, go to [enter.pollinations.ai](https://enter.pollinations.ai) → **Create New App Key**:

<p align="left"><img src="https://media.pollinations.ai/1133540dc4c19635" alt="Edit App Key" width="420"></p>

Set the **Name** (shows on the consent screen). For web apps, add at least one **Redirect URI** (your exact callback URL). The key you get back is your `client_id` (a `pk_...` publishable key; the legacy name `app_key` is still accepted).

When a user lands on the consent screen signed-out, they're prompted to continue with GitHub:

<p align="left"><img src="https://media.pollinations.ai/fbc04dd1c77dbfd8" alt="Authorize — signed out" width="420"></p>

Once signed in, they review the requested access and confirm:

<p align="left"><img src="https://media.pollinations.ai/a7e4a1e9c5f48b8d" alt="Authorize — signed in" width="420"></p>

## Developer Earnings

Developer earnings are opt-in per App Key. When enabled, users pay 25% over base rates. The markup credits to your balance.

```text
Base request cost: 1.00 pollen
User pays:         1.25 pollen
You receive:       0.25 pollen
```

Credits land in the same balance type the user paid from: Quest Pollen when the request used Quest Pollen, Paid Pollen when it used Paid Pollen.

Pass `earningsEnabled: true` when creating an App Key via the API, or toggle it later from the dashboard:

```bash
curl -X POST https://gen.pollinations.ai/account/keys \
  -H 'Authorization: Bearer sk_yoursecretkey' \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-app","type":"publishable","redirectUris":["https://myapp.com/callback"],"earningsEnabled":true}'
```

## ⚙️ Web Apps (OAuth Code Flow)

Use the OAuth authorization-code flow with PKCE for new web integrations. It keeps the `sk_...` key out of the browser callback URL and works with standard OAuth clients.

Discovery is available at:

```text
https://enter.pollinations.ai/.well-known/oauth-authorization-server
```

### 1. Build the Auth Link

Generate a fresh PKCE verifier and S256 challenge, then send the user to `/authorize`:

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

With restrictions:
```text
https://enter.pollinations.ai/authorize?response_type=code&redirect_uri=https://myapp.com/callback&client_id=pk_yourkey&scope=usage&models=flux,openai&expiry=7&budget=10&state=random&code_challenge=...&code_challenge_method=S256
```

| Param | What it does | Example |
|-------|-------------|---------|
| `client_id` | Your publishable key — shows app name + author on consent screen, tracks traffic and developer earnings | `pk_abc123` |
| `redirect_uri` | Where users return after authorizing — must match a Redirect URI on the App Key | `https://myapp.com/callback` |
| `response_type` | Use `code` for the OAuth authorization-code flow | `code` |
| `state` | Opaque value echoed back on the callback for CSRF protection | `any-random-string` |
| `code_challenge` | Base64url SHA-256 of your PKCE verifier | `abc...` |
| `code_challenge_method` | Must be `S256` | `S256` |
| `scope` | Account access (space or comma separated) | `usage keys` |
| `models` | Restrict to specific models | `flux,openai,gptimage` |
| `budget` | Numeric Pollen cap. Defaults to `5`; users can clear the budget field on the consent screen for unlimited. | `10` |
| `expiry` | User-authorized key lifetime in days (default: 7) | `7` |

Legacy names `app_key`, `redirect_url`, and `permissions` are still accepted for backwards compatibility.

### 2. Handle the Redirect

User comes back with a short-lived code:

```text
https://myapp.com/callback?code=oauth_code&state=random-csrf-token
```

Validate `state`, then exchange the code from your server:

```bash
curl -X POST https://enter.pollinations.ai/api/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=authorization_code' \
  -d 'code=oauth_code' \
  -d 'client_id=pk_yourkey' \
  -d 'redirect_uri=https://myapp.com/callback' \
  -d 'code_verifier=YOUR_PKCE_VERIFIER'
# → { "access_token": "sk_...", "token_type": "bearer", "expires_in": 604800, "scope": "profile usage" }
```

The authorization code is single-use and expires after 10 minutes. Token responses use RFC 6749 error objects such as `invalid_grant`, `invalid_request`, and `unsupported_grant_type`.

### 3. Call Pollinations

Use the returned `access_token` as the API key:

```javascript
fetch('https://gen.pollinations.ai/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'openai', messages: [{ role: 'user', content: 'yo' }] })
});
```

See `apps/oauth-client-demo/` for a zero-dependency reference client.

## ⚙️ Legacy Web Apps (Fragment Flow)

The older BYOP redirect flow is still supported. It returns the user-authorized key directly in the URL fragment and does not use PKCE.

```text
https://enter.pollinations.ai/authorize?redirect_uri=https://myapp.com/callback&client_id=pk_yourkey&scope=usage
```

User comes back with the key in the URL fragment:

```text
https://myapp.com/callback#api_key=sk_abc123xyz
```

Fragment, not query param — never hits server logs. 🔒 If you passed `state`, it's echoed back: `#api_key=sk_...&state=...`. On denial the fragment is `#error=access_denied&state=...`.

### Code

```javascript
// Send user to auth
const params = new URLSearchParams({
  redirect_uri: location.href,
  client_id: 'pk_yourkey',
});
window.location.href = `https://enter.pollinations.ai/authorize?${params}`;

// Grab key from URL after redirect
const apiKey = new URLSearchParams(location.hash.slice(1)).get('api_key');

// Use their pollen
fetch('https://gen.pollinations.ai/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'openai', messages: [{ role: 'user', content: 'yo' }] })
});
```

## 🖥️ CLIs & Headless Apps (Device Flow)

Same authorize screen, but the user opens a browser separately. Your CLI polls for the key.

**Where this fits:**
- **Discord / Telegram / WhatsApp bots** — bot DMs the code, user approves in browser, bot gets their key
- **CLI tools** — `pollinations login` opens a browser, CLI waits for approval
- **MCP servers** — AI agent requests access, user approves from their browser
- **Raspberry Pi / IoT** — headless device displays a code, user approves on their phone
- **VS Code extensions** — extension shows the code, user approves in browser

```bash
# 1. request a device code (pass your app_key as client_id for attribution)
curl -X POST https://enter.pollinations.ai/api/device/code \
  -H 'Content-Type: application/json' \
  -d '{"client_id": "pk_yourkey", "scope": "generate"}'
# → { "device_code": "...", "user_code": "ABCD-1234", "verification_uri": "/device" }

# 2. tell user: "go to enter.pollinations.ai/device and enter ABCD-1234"

# 3. poll for the key (every 5s)
curl -X POST https://enter.pollinations.ai/api/device/token \
  -H 'Content-Type: application/json' \
  -d '{"device_code": "..."}'
# pending → { "error": "authorization_pending" }
# done    → { "access_token": "sk_...", "token_type": "bearer", "scope": "generate" }
```

The same device-code exchange is also available through the standard token endpoint:

```bash
curl -X POST https://enter.pollinations.ai/api/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=urn:ietf:params:oauth:grant-type:device_code' \
  -d 'device_code=...'
```

## 👤 Who's Using This Key?

Once you have the user-authorized `sk_...` key, you can check who it belongs to:

```bash
curl https://enter.pollinations.ai/api/device/userinfo \
  -H 'Authorization: Bearer sk_...'
# → { "sub": "user-id", "preferred_username": "voodoohop", "picture": "..." }
# with the `profile` scope, also: "name": "Thomas", "email": "..."
```

`/api/oauth/userinfo` returns the same standard OIDC userinfo shape. `name` and `email` are included only when the key carries the `profile` scope.

---

🕐 User-authorized keys default to 7 days. Users can revoke anytime from the dashboard.

[edit this doc](https://github.com/pollinations/pollinations/edit/main/BRING_YOUR_OWN_POLLEN.md) · *h/t [Puter.js](https://docs.puter.com/user-pays-model/) for the idea*
