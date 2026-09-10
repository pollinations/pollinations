# Pollen Connect

Pollen Connect (previously called BYOP, Bring Your Own Pollen) lets your users authorize your app to spend their own Pollen on Pollinations requests. Your publishable App Key (`pk_...`) identifies the app; after approval, Pollinations returns a scoped user key (`sk_...`) for API calls.

Users stay in control of their balance, budgets, and revocation; your app never has to pay for their usage.

## Choose an integration

Pollen Connect supports both a lightweight direct redirect and OAuth. Both use the same authorization screen and issue a user key with the approved permissions, model access, budget, and expiry. Choose one method for your app; you do not need to implement both.

| Method | How access reaches your app | When to use it |
|--------|----------------------------|----------------|
| [OAuth with PKCE](#oauth-code-flow) | Exchange a temporary code for the user key | Recommended for new web and mobile integrations; works in plain JavaScript without a backend |
| [Direct redirect](#direct-redirect-simple-byop) | Read the user key from the callback URL fragment | A minimal integration with fewer steps; does not use PKCE |
| [Device authorization](#device-flow) | Poll for access while the user approves in another browser | CLIs, bots, and headless apps |

BYOP describes users bringing their own Pollen; it is not a synonym for the direct redirect method. The SDK already uses OAuth with PKCE for this user-pays model.

### Sign-in and consent

1. Your app opens Pollinations authorization.
2. Signed-out users choose **Continue with GitHub**. GitHub sign-in creates a Pollinations account for new users and returns them to the authorization request. Existing Pollinations sessions skip this sign-in step.
3. The user reviews the app identity, profile/account permissions, model access, spending budget, and expiry, then chooses **Allow access** or **Cancel**.
4. Your app receives the approved credential using the selected method.

`profile` allows reading the user's name and email; username and picture are already available to a connected app. `usage` allows reading the full account balance and usage. Generation is authorized through model access and spending limits, not an OAuth account scope: requesting only `profile` does **not** make this an identity-only login.

### React quick start

The SDK handles the OAuth redirect, PKCE, and callback. Use the shared UI package for the Pollinations logo button and connected identity:

```tsx
import { PolliProvider } from '@pollinations/sdk/react';
import { AppUserMenu } from '@pollinations/ui/app-user-menu/sdk';
import '@pollinations/ui/styles.css';

export function App() {
  return (
    <PolliProvider
      appKey="pk_yourkey"
      permissions={['usage']}
      storage="sessionStorage"
    >
      <AppUserMenu />
    </PolliProvider>
  );
}
```

Register the page's exact callback URL on your App Key. The `usage` permission enables the account balance display; users can decline optional permissions. You can also use `LoginButton` from `@pollinations/ui/auth/sdk` or build your own interface with the SDK hooks.

### Returning, signing out, and removing access

- **Returning:** the app can reuse its saved, valid key without another authorization redirect. This is credential reuse, not a remembered approval that automatically issues new keys.
- **New authorization:** visiting `/authorize` asks for approval again and creates another key when approved. There are no refresh tokens.
- **Expired or revoked access:** authorize again. The SDK account hooks clear the local connection when an account request returns 401; custom integrations must handle invalid credentials too.
- **Disconnect:** the account control forgets this app's locally stored key. It does not revoke it or sign the user out of Pollinations.
- **Remove access:** visit [API keys](https://enter.pollinations.ai/keys), where users can edit or revoke keys. Revoke every key issued to an app to remove all its key-based access; there is currently no single app-wide revocation control here.
- **Cancel:** declines this request and returns `access_denied`. It does not revoke earlier keys or approvals. Keep the app usable and offer a retry.

### Wallet top-ups and developer earnings

The shared app account menu shows the remaining allowance beneath the name. When the key allowance is exhausted, “Limit reached” replaces the amount and Raise limit appears in the dropdown. On the authorization screen, the Dashboard link shows identity and Paid/Quest balances. Funding CTAs appear above Budget only when there is a confirmed funding issue. Wallet funds and the app’s spending allowance are separate: topping up does not increase the key limit. Payment happens in the Pollinations purchase flow. Developer earnings are a markup on generation usage, described below; they are separate from buying Pollen.

### Pollinations dashboard identity login

KPI, Economics, and Observability use a separate identity OAuth service with PKCE and a backend admin check. These trusted internal clients currently skip consent and receive profile information and an admin role, without a delegated generation key. Their identity tokens and endpoints are not interchangeable with the wallet keys and endpoints in this guide. Identity client registration is not currently open to third-party developers.

## 🗝️ App Key

An **App Key** (`pk_...`) is the publishable key your app sends users to Pollinations with. Without one, the consent screen falls back to the redirect hostname and traffic isn't attributed to your account.

To create one, go to [enter.pollinations.ai](https://enter.pollinations.ai/keys) → **Create New App Key**:

<p align="left"><img src="https://media.pollinations.ai/28716f8fb8677eff" alt="Edit App Key" width="420"></p>

Set the **Name** (shows on the consent screen). For web apps, add at least one **Redirect URI** (your exact callback URL). The key you get back is your `client_id` (a `pk_...` publishable key; the legacy name `app_key` is still accepted).

When a user lands on the consent screen signed-out, they're prompted to continue with GitHub:

<p align="left"><img src="https://media.pollinations.ai/f9fd70e72156ddec" alt="Authorize — signed out" width="420"></p>

Once signed in, they review the requested access and confirm:

<p align="left"><img src="https://media.pollinations.ai/2ab9b5e0a2408e93" alt="Authorize — signed in" width="420"></p>

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

<a id="oauth-code-flow"></a>

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
https://enter.pollinations.ai/authorize?response_type=code&redirect_uri=https://myapp.com/callback&client_id=pk_yourkey&scope=usage&models=black-forest-labs/flux.1-schnell,openai/gpt-5.4-nano&expiry=7&budget=10&state=random&code_challenge=...&code_challenge_method=S256
```

| Param | What it does | Example |
|-------|-------------|---------|
| `client_id` | Your publishable key — shows app name + author on consent screen, tracks traffic and developer earnings | `pk_abc123` |
| `redirect_uri` | Where users return after authorizing — must exactly match a Redirect URI on the App Key, query string included (loopback `http://localhost` matches any port) | `https://myapp.com/callback` |
| `response_type` | Use `code` for the OAuth authorization-code flow | `code` |
| `state` | Opaque value echoed back on the callback for CSRF protection | `any-random-string` |
| `code_challenge` | Base64url SHA-256 of your PKCE verifier | `abc...` |
| `code_challenge_method` | Must be `S256` | `S256` |
| `scope` | Account access (space or comma separated) | `usage keys` |
| `models` | Restrict to specific models | `black-forest-labs/flux.1-schnell,openai/gpt-5.4-nano,openai/gpt-image-1-mini` |
| `budget` | Numeric Pollen cap. Defaults to `5`; users can clear the budget field on the consent screen for unlimited. | `10` |
| `expiry` | User-authorized key lifetime in days (default: 7) | `7` |

Legacy names `app_key`, `redirect_url`, and `permissions` are still accepted for backwards compatibility.

### 2. Handle the Redirect

User comes back with a short-lived code:

```text
https://myapp.com/callback?code=oauth_code&state=random-csrf-token
```

Validate `state`, then exchange the code at the token endpoint. Server-backed apps
call it from their backend; static browser apps can call it directly, because PKCE
replaces the client secret:

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

Scopes: `profile` (name + email), `usage` (account balance + usage), `keys` (account admin — create/list/revoke keys). The response's `scope` echoes what the user actually granted, which may be narrower than requested. Generation needs no scope — spending is bounded by the budget and expiry the user approved. There are no refresh tokens; re-run the flow when the key expires. Issued keys appear in the user's dashboard like any other API key and can be edited or revoked there at any time — revocation is immediate.

**Browser-only apps.** The same request works from `fetch`:

```javascript
const res = await fetch('https://enter.pollinations.ai/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code,                                        // From the callback URL
    client_id: 'pk_yourkey',
    redirect_uri: 'https://myapp.com/callback',  // Exact registered URI
    code_verifier,                               // The verifier you saved
  }),
});
const { access_token } = await res.json();
```

For custom browser integrations, prefer memory after the callback or `sessionStorage` for a connection limited to the current tab. The SDK defaults to `localStorage` for persistence across visits; explicitly set `storage="sessionStorage"` to limit that persistence. Both browser storage options are accessible to scripts on your origin. Keep credentials out of analytics, logs, and application URLs; clear a direct-redirect fragment immediately after reading it.

### 3. Call Pollinations

Use the returned `access_token` as the API key:

```javascript
fetch('https://gen.pollinations.ai/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'openai/gpt-5.4-nano', messages: [{ role: 'user', content: 'yo' }] })
});
```

Examples: [browser-only](https://github.com/pollinations/pollinations/tree/main/apps/oauth-client-demo) ·
[existing user database](https://github.com/pollinations/pollinations/tree/main/apps/oauth-account-linking-demo)

<a id="️-legacy-web-apps-fragment-flow"></a>

## Direct redirect (simple BYOP)

The direct redirect is a supported lightweight method. It returns the user-authorized key directly in the URL fragment and does not use PKCE. OAuth is recommended for new integrations because it keeps that key out of the callback URL and binds the code exchange to the app that started it.

```text
https://enter.pollinations.ai/authorize?redirect_uri=https://myapp.com/callback&client_id=pk_yourkey&scope=usage
```

User comes back with the key in the URL fragment:

```text
https://myapp.com/callback#api_key=sk_abc123xyz
```

Browsers do not send the fragment in HTTP requests, but page scripts and browser history can still expose it. Validate `state` and remove the fragment immediately. If you passed `state`, it is echoed back: `#api_key=sk_...&state=...`. On denial the fragment is `#error=access_denied&state=...`.

### Code

Include a status element on the callback page, such as `<p id="connection-status" role="status"></p>`.

```javascript
// Run when the user chooses Connect.
function connect() {
  const state = crypto.randomUUID();
  sessionStorage.setItem('pollen-connect-state', state);
  const params = new URLSearchParams({
    redirect_uri: 'https://myapp.com/callback',
    client_id: 'pk_yourkey',
    state,
  });
  window.location.assign(`https://enter.pollinations.ai/authorize?${params}`);
}

// Run on your callback page, before loading third-party scripts.
const result = new URLSearchParams(location.hash.slice(1));
if (result.has('api_key') || result.has('error')) {
  history.replaceState(null, '', location.pathname + location.search);
  const expectedState = sessionStorage.getItem('pollen-connect-state');
  sessionStorage.removeItem('pollen-connect-state');
  if (!expectedState || result.get('state') !== expectedState) {
    throw new Error('Connection could not be verified. Please connect again.');
  }
  if (result.has('error')) {
    // Show a cancellation/error message and a Connect button in your app.
    document.querySelector('#connection-status').textContent =
      'Connection was not completed. You can try again.';
  } else {
    const apiKey = result.get('api_key');
    // Keep the key in memory and use it as the Bearer token for API calls.
  }
}
```

<a id="device-flow"></a>

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
  -d '{"client_id": "pk_yourkey"}'
# → { "device_code": "...", "user_code": "ABCD-1234", "verification_uri": "/device" }

# 2. tell user: "go to enter.pollinations.ai/device and enter ABCD-1234"

# 3. poll for the key (every 5s)
curl -X POST https://enter.pollinations.ai/api/device/token \
  -H 'Content-Type: application/json' \
  -d '{"device_code": "..."}'
# pending → { "error": "authorization_pending" }
# done    → { "access_token": "sk_...", "token_type": "bearer" }
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
