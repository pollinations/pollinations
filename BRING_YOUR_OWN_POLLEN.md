# 🌼 Bring Your Own Pollen (BYOP)

Your users pay for their own AI usage. You pay $0.

## 🔄 How It Works

1. User connects — via your web app or CLI
2. Signs in, creates a scoped API key
3. Their pollen, your app

Why this is good:

- 💸 **$0 costs** — scales to any number of users without costing you a cent
- 🔑 **No key management** — the auth flow handles it
- ⚖️ **Self-regulating** — everyone pays for what they use
- 🌐 **Works everywhere** — web apps, CLIs, MCP servers, anything

Both flows land on the same authorize screen where users set model restrictions, budget, and expiry. Same key, same pollen, different entry point.

## 🗝️ App Key

An **App Key** is a publishable key (`pk_...`) you create on [enter.pollinations.ai](https://enter.pollinations.ai) specifically for BYOP. It's optional but strongly recommended:

| Without App Key | With App Key |
|----------------|-------------|
| Consent screen shows generic hostname | Consent screen shows **your app name + your GitHub** |
| No traffic attribution | Traffic your app drives is **tracked to your account** |
| No tier benefit | Real usage → **automatic tier upgrades** → higher pollen grants |

To create one, go to [enter.pollinations.ai](https://enter.pollinations.ai) → **Create New App Key**:

<p align="left"><img src="https://media.pollinations.ai/1133540dc4c19635" alt="Edit App Key" width="420"></p>

Set the **Name** (shows on the consent screen) and at least one **Redirect URI** (your exact callback URL). The key you get back is your `client_id` (a `pk_...` publishable key; the legacy name `app_key` is still accepted).

When a user lands on the consent screen signed-out, they're prompted to continue with GitHub:

<p align="left"><img src="https://media.pollinations.ai/fbc04dd1c77dbfd8" alt="Authorize — signed out" width="420"></p>

Once signed in, they review the requested access and confirm:

<p align="left"><img src="https://media.pollinations.ai/a7e4a1e9c5f48b8d" alt="Authorize — signed in" width="420"></p>

## 💰 Developer earnings (optional)

**Developer earnings** are on by default for every App Key. Users are billed +25% over model cost; that 0.25 on every 1.25 lands in your wallet — in your **tier balance** if the user paid from their tier, or your **paid balance** if they paid from theirs. Earnings mirror the user's spend bucket. Same number, two framings: +25% markup = 20% of user spend. Toggle off on the App Key if you don't want it.

## 🪣 Bucket selection (per request)

```
if (paidOnly) bucket = paid
else if (tier ≥ amount) bucket = tier
else bucket = paid
```

All-or-nothing per request — no partial spend across buckets. If the chosen bucket can't cover the estimate, the request is refused (HTTP 402).

## 📝 Notes

- Each request is sized from a 7-day rolling average for that model — if no eligible balance can cover the estimate under the spend rules, the request is refused before it runs.
- Refused requests cost zero Pollen and generate zero developer earnings — no spend, no markup.
- Once a Pollen pack has been touched, it's non-refundable; refunds apply to fully unused packs only.

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

## 📚 Glossary

| Concept | Use | Don't use |
|---|---|---|
| Free hourly grant + tier-side earnings | **Tier balance** | "Earning Balance", "Tier Pollen", "Free hourly Pollen" |
| Purchased Pollen + paid-side earnings | **Paid balance** | "Earning Balance", "Top-up balance", "Pack" / "Pack balance" |
| Models that need paid balance | **Paid-only** | "Premium", "Paid models" |
| The +25% feature (dev-side label) | **Developer earnings** | "BYOP earnings", "App key markup" |
| Per-key spend cap | **Budget** (field) / "spending cap" (prose) | "Limit" (ambiguous) |
| Publishable key for BYOP apps | **App Key** (`pk_…`) — used by apps to attribute traffic, set redirect URIs, toggle Developer earnings | Don't conflate with API key. |
| Server-side keys with no rate limits | **Secret Key** (`sk_…`) — created in the dashboard, used in backend code | Don't conflate with App Key. |
| Generic umbrella term | **API key** = any `sk_` or `pk_` key — only use when both are valid in context | Don't use as a synonym for either App Key or Secret Key. |
| Tier system | **Tier** (Spore / Seed / Flower) | — |

**App Key vs Secret Key vs API key** is the most common confusion among new BYOP devs. App Keys (`pk_…`) are publishable, used in client apps, and attribute traffic. Secret Keys (`sk_…`) are server-side, never exposed to users, and have no rate limits. "API key" is the umbrella — use only when both apply.

[edit this doc](https://github.com/pollinations/pollinations/edit/main/BRING_YOUR_OWN_POLLEN.md) · *h/t [Puter.js](https://docs.puter.com/user-pays-model/) for the idea*
