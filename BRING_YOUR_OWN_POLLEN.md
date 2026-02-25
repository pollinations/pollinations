# Bring Your Own Pollen (BYOP) 🌸

Users pay for their own AI usage. You pay $0. Ship apps without API costs.

## The Flow

1. User taps "Connect with Pollinations"
2. They sign in → get a temp API key
3. Their pollen, your app

## Why BYOP?

- **$0 costs** — 1 user or 1000, same price: free
- **No key drama** — auth flow handles it
- **Self-regulating** — everyone pays for their own usage
- **Frontend only** — no backend needed

![Authorize Screen](https://raw.githubusercontent.com/pollinations/pollinations/main/enter.pollinations.ai/public/authorize-screen.png)

## Setup

### 1. Register your app (recommended)

Create a publishable key at [enter.pollinations.ai](https://enter.pollinations.ai):
- Set **App URL** to your app's base URL (e.g. `https://myapp.com`)
- Enable **BYOP** toggle
- The key name becomes your app's display name on the consent screen

### 2. Build the auth link

**Basic (with app registration):**
```
https://enter.pollinations.ai/authorize?redirect_url=https://myapp.com&app_key=pk_yourkey
```

**Basic (without registration):**
```
https://enter.pollinations.ai/authorize?redirect_url=https://myapp.com
```

**With preselected options:**
```
https://enter.pollinations.ai/authorize?redirect_url=https://myapp.com&app_key=pk_yourkey&models=flux,openai&expiry=7&budget=10
```

| Param | Description | Example |
|-------|-------------|---------|
| `app_key` | Your publishable key (shows app name + author) | `pk_abc123` |
| `models` | Allowed models (comma-separated) | `flux,openai,gptimage` |
| `budget` | Pollen budget limit | `10` |
| `expiry` | Key expiry in days (default: 30) | `7` |
| `permissions` | Account permissions | `profile,balance,usage` |

### 3. Handle the redirect

```
https://myapp.com#api_key=sk_abc123xyz
```

> Key is in the `#` fragment — never hits server logs 🔒

## What the user sees

**With `app_key`:** App name (large), developer @github link, hostname, permissions

**Without `app_key`:** Just the hostname and permissions (still works fine)

Registering your app also lets us track usage per app — devs who bring significant traffic may qualify for higher tiers.

## Code

```javascript
// 1. Send user to auth (app_key shows your app name on consent screen)
const params = new URLSearchParams({
  redirect_url: location.href,
  app_key: 'pk_yourkey', // optional — shows app name + author
});
window.location.href = `https://enter.pollinations.ai/authorize?${params}`;

// 2. Grab key from URL after redirect
const apiKey = new URLSearchParams(location.hash.slice(1)).get('api_key');

// 3. Use their pollen
fetch('https://gen.pollinations.ai/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'openai', messages: [{ role: 'user', content: 'yo' }] })
});
```

Keys expire in 30 days · revoke anytime from dashboard

---

[📝 Edit this doc](https://github.com/pollinations/pollinations/edit/main/BRING_YOUR_OWN_POLLEN.md) · *h/t [Puter.js](https://docs.puter.com/user-pays-model/) for pioneering this*
