# 🌼 Bring Your Own Pollen (BYOP)

Your users pay for their own AI usage. You pay $0.

## 🗝️ App Key

An **App Key** (`pk_…`) is the publishable key your app sends users to Pollinations with. Without one, the consent screen falls back to the redirect hostname and traffic isn't attributed to your account.

To create one, go to [enter.pollinations.ai](https://enter.pollinations.ai) → **Create New App Key**:

<p align="left"><img src="https://media.pollinations.ai/1133540dc4c19635" alt="Edit App Key" width="420"></p>

Set the **Name** (shows on the consent screen). For web apps, add at least one **Redirect URI** (your exact callback URL). The key you get back is your `client_id` (a `pk_...` publishable key; the legacy name `app_key` is still accepted).

When a user lands on the consent screen signed-out, they're prompted to continue with GitHub:

<p align="left"><img src="https://media.pollinations.ai/fbc04dd1c77dbfd8" alt="Authorize — signed out" width="420"></p>

Once signed in, they review the requested access and confirm:

<p align="left"><img src="https://media.pollinations.ai/a7e4a1e9c5f48b8d" alt="Authorize — signed in" width="420"></p>

## 💰 Earnings

Each App Key has a `Developer earnings` flag. When enabled, every request through the key bills the user +25% over model cost and credits the difference to your wallet.

### How it's billed

```
Model cost:    1.00 pollen   (the request's billed cost)
User billed:   1.25 pollen   (+25% over model cost)
Your credit:   0.25 pollen   (= 20% of user spend)
```

Earnings are credited as Pollen and spendable across the Pollinations API like any other balance.

### Where it lands

The credit lands in the same bucket the user paid from — **tier balance** if the user paid from their tier, **paid balance** if they paid from theirs. Bucket selection per request:

```
if (paidOnly) bucket = paid
else if (tier ≥ amount) bucket = tier
else bucket = paid
```

All-or-nothing per request — no partial spend across buckets. Each request is sized from a 7-day rolling average for the model; if the chosen bucket can't cover the estimate, the request is refused (HTTP 402) **before it runs**.

Refused requests, cached requests, and requests through an App Key with `earningsEnabled=false` generate zero earnings — no spend, no markup.

### Toggle

In the dashboard: open the App Key → flip the **Developer earnings** switch.

Programmatically:

```bash
curl -X POST https://enter.pollinations.ai/api/api-keys/<keyId>/update \
  -H 'Authorization: Bearer sk_yoursecretkey' \
  -H 'Content-Type: application/json' \
  -d '{"metadata": {"earningsEnabled": false}}'
```

## ⚙️ Web Apps (Redirect Flow)

### 1. Build the Auth Link

With `client_id` (consent screen shows your app name + your GitHub):
```
https://enter.pollinations.ai/authorize?redirect_uri=https://myapp.com&client_id=pk_yourkey
```

Without (still works, just shows the hostname):
```
https://enter.pollinations.ai/authorize?redirect_uri=https://myapp.com
```

With restrictions:
```
https://enter.pollinations.ai/authorize?redirect_uri=https://myapp.com&client_id=pk_yourkey&scope=usage&models=flux,openai&expiry=7&budget=10
```

| Param | What it does | Example |
|-------|-------------|---------|
| `client_id` | Your publishable key — shows app name + author on consent screen, tracks traffic for tier upgrades | `pk_abc123` |
| `redirect_uri` | Where users return after authorizing — receives the temp API key in the URL fragment | `https://myapp.com` |
| `state` | Opaque value echoed back on the callback for CSRF protection | `any-random-string` |
| `scope` | Account access (space or comma separated) | `usage keys` |
| `models` | Restrict to specific models | `flux,openai,gptimage` |
| `budget` | Numeric Pollen cap. Defaults to `5`; users can clear the budget field on the consent screen for unlimited. | `10` |
| `expiry` | Key lifetime in days (default: 30) | `7` |

Legacy names `app_key`, `redirect_url`, and `permissions` are still accepted for backwards compatibility.

### 2. Handle the Redirect

User comes back with a key in the URL fragment:
```
https://myapp.com#api_key=sk_abc123xyz
```

Fragment, not query param — never hits server logs. 🔒 If you passed `state`, it's echoed back: `#api_key=sk_...&state=...`. On denial the fragment is `#error=access_denied&state=...`.

### 💻 Code

```javascript
// Send user to auth
const params = new URLSearchParams({
  redirect_uri: location.href,
  client_id: 'pk_yourkey', // optional — shows app name + author
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

## 👤 Who's Using This Key?

Once you have a key, you can check who it belongs to:

```bash
curl https://enter.pollinations.ai/api/device/userinfo \
  -H 'Authorization: Bearer sk_...'
# → { "sub": "user-id", "name": "Thomas", "preferred_username": "voodoohop", "email": "...", "picture": "..." }
```

Standard OIDC userinfo shape — works with any `sk_` or `pk_` key.

---

🕐 Keys expire in 30 days. Users can revoke anytime from the dashboard.

[edit this doc](https://github.com/pollinations/pollinations/edit/main/BRING_YOUR_OWN_POLLEN.md) · *h/t [Puter.js](https://docs.puter.com/user-pays-model/) for the idea*
