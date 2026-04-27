# 🌼 Bring Your Own Pollen (BYOP)

Your users connect their Pollinations account to your app and spend their own Pollen on AI generations. Their requests use their wallet, not yours.

## 🔄 How It Works

1. Your app sends the user to the Pollinations authorization screen.
2. The user approves a scoped key for your app.
3. AI requests from your app spend the user's Pollen.
4. If you use an App Key, usage and earnings are attributed to your account.

Why this is good:

- 💸 **$0 costs** — user usage does not spend your Pollen
- **🌻 Dev earnings** — earn 20% of every Pollen your users spend through your app, credited to your wallet
- 🔐 **Scoped access** — users approve model limits, budget, and expiry
- 🔑 **No key management** — the auth flow handles it
- ⚖️ **Self-regulating** — everyone pays for what they use
- 🌐 **Works everywhere** — web apps, CLIs, MCP servers, anything

Both flows land on the same authorize screen where users set model restrictions, budget, and expiry. Same key, same Pollen, different entry point.

## 🗝️ App Key

An **App Key** is a public app identifier (`pk_...`) you create on [enter.pollinations.ai](https://enter.pollinations.ai) specifically for BYOP. It's optional but strongly recommended:

| Without App Key | With App Key |
|----------------|-------------|
| Consent screen shows generic hostname | Consent screen shows **your app name + your GitHub** |
| No traffic attribution | Traffic your app drives is **tracked to your account** |
| No earnings attribution | You earn **20% of every Pollen** your users spend through your app |

To create one, go to [enter.pollinations.ai](https://enter.pollinations.ai) → **Create New App Key**:

![Create New App Key](https://media.pollinations.ai/aa8ca9fe3110aff7)

Set the **Name** (shows on the consent screen) and **App URL** (your app's domain). The key you get back is your `client_id` (a `pk_...` App Key; the legacy name `app_key` is still accepted).

When users authorize, this is what they see:

![Authorize Screen](https://media.pollinations.ai/b030a47e32df2b2b)

## 👛 User Pollen

BYOP requests spend from the user's Pollinations wallet, not your app balance.

Regular models can use the user's free 🌱 Tier Pollen first. Paid-only models require 🌻 Dev earnings or 💳 Top-up Pollen.

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
| `client_id` | Your App Key — shows app name + author on consent screen and attributes usage and earnings to your account | `pk_abc123` |
| `redirect_uri` | Where users return after authorizing — receives the temp API key in the URL fragment | `https://myapp.com` |
| `state` | Opaque value echoed back on the callback for CSRF protection | `any-random-string` |
| `scope` | Account access (space or comma separated) | `usage keys` |
| `models` | Restrict to specific models | `flux,openai,gptimage` |
| `budget` | Pollen cap | `10` |
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

// Use their Pollen
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
