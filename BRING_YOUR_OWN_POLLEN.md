# 🌼 Bring Your Own Pollen (BYOP)

Your users pay for their own AI usage. You pay $0.

## 🔄 How It Works

1. User taps "Connect with Pollinations"
2. Signs in, gets a temp API key
3. Their pollen, your app

Why this is good:

- 💸 **$0 costs** — 1 user or 1000, same price: free
- 🔑 **No key management** — the auth flow handles it
- ⚖️ **Self-regulating** — everyone pays for what they use
- 🖥️ **Frontend only** — no backend needed

## 🗝️ App Key

An **App Key** is a publishable key (`pk_...`) you create on [enter.pollinations.ai](https://enter.pollinations.ai) specifically for BYOP. It's optional but strongly recommended:

| Without App Key | With App Key |
|----------------|-------------|
| Consent screen shows generic hostname | Consent screen shows **your app name + your GitHub** |
| No traffic attribution | Traffic your app drives is **tracked to your account** |
| No tier benefit | Real usage → **automatic tier upgrades** → higher pollen grants |

To create one, go to [enter.pollinations.ai](https://enter.pollinations.ai) → **Create New App Key**:

![Create New App Key](https://media.pollinations.ai/aa8ca9fe3110aff7)

Set the **Name** (shows on the consent screen) and **App URL** (your app's domain). The key you get back is your `app_key`.

When users authorize, this is what they see:

![Authorize Screen](https://media.pollinations.ai/b030a47e32df2b2b)

## ⚙️ Setup

### 1. Build the Auth Link

With `app_key` (consent screen shows your app name + your GitHub):
```
https://enter.pollinations.ai/authorize?redirect_url=https://myapp.com&app_key=pk_yourkey
```

Without (still works, just shows the hostname):
```
https://enter.pollinations.ai/authorize?redirect_url=https://myapp.com
```

With restrictions:
```
https://enter.pollinations.ai/authorize?redirect_url=https://myapp.com&app_key=pk_yourkey&models=flux,openai&expiry=7&budget=10
```

| Param | What it does | Example |
|-------|-------------|---------|
| `app_key` | Your publishable key — shows app name + author on consent screen, tracks traffic for tier upgrades | `pk_abc123` |
| `redirect_url` | Where users return after authorizing — receives the temp API key in the URL fragment | `https://myapp.com` |
| `models` | Restrict to specific models | `flux,openai,gptimage` |
| `budget` | Pollen cap | `10` |
| `expiry` | Key lifetime in days (default: 30) | `7` |
| `permissions` | Account access | `profile,balance,usage` |

### 2. Handle the Redirect

User comes back with a key in the URL fragment:
```
https://myapp.com#api_key=sk_abc123xyz
```

Fragment, not query param — never hits server logs. 🔒

## 💻 Code

```javascript
// Send user to auth
const params = new URLSearchParams({
  redirect_url: location.href,
  app_key: 'pk_yourkey', // optional — shows app name + author
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

🕐 Keys expire in 30 days. Users can revoke anytime from the dashboard.

---

[edit this doc](https://github.com/pollinations/pollinations/edit/main/BRING_YOUR_OWN_POLLEN.md) · *h/t [Puter.js](https://docs.puter.com/user-pays-model/) for the idea*
