# Bring Your Own Pollen (BYOP)

your users pay for their own AI usage. you pay $0.

## how it works

1. user taps "Connect with Pollinations"
2. signs in, gets a temp API key
3. their pollen, your app

why this is good:
- **$0 costs** — 1 user or 1000, same price: free
- **no key management** — the auth flow handles it
- **self-regulating** — everyone pays for what they use
- **frontend only** — no backend needed

![Authorize Screen](https://raw.githubusercontent.com/pollinations/pollinations/main/enter.pollinations.ai/public/authorize-screen.png)

## setup

### 1. register your app (optional but recommended)

go to [enter.pollinations.ai](https://enter.pollinations.ai), create a publishable key:
- set **App URL** to your app's URL (e.g. `https://myapp.com`)
- enable **BYOP** toggle
- the key name shows up as your app name on the consent screen

this also lets us see how much traffic your app drives — apps that bring real usage get bumped to higher tiers.

### 2. build the auth link

with `app_key` (consent screen shows your app name + your github):
```
https://enter.pollinations.ai/authorize?redirect_url=https://myapp.com&app_key=pk_yourkey
```

without (still works, just shows the hostname):
```
https://enter.pollinations.ai/authorize?redirect_url=https://myapp.com
```

with restrictions:
```
https://enter.pollinations.ai/authorize?redirect_url=https://myapp.com&app_key=pk_yourkey&models=flux,openai&expiry=7&budget=10
```

| param | what it does | example |
|-------|-------------|---------|
| `app_key` | your publishable key — shows app name + author | `pk_abc123` |
| `models` | restrict to specific models | `flux,openai,gptimage` |
| `budget` | pollen cap | `10` |
| `expiry` | key lifetime in days (default: 30) | `7` |
| `permissions` | account access | `profile,balance,usage` |

### 3. handle the redirect

user comes back with a key in the URL fragment:
```
https://myapp.com#api_key=sk_abc123xyz
```

fragment, not query param — never hits server logs.

## code

```javascript
// send user to auth
const params = new URLSearchParams({
  redirect_url: location.href,
  app_key: 'pk_yourkey', // optional — shows app name + author
});
window.location.href = `https://enter.pollinations.ai/authorize?${params}`;

// grab key from URL after redirect
const apiKey = new URLSearchParams(location.hash.slice(1)).get('api_key');

// use their pollen
fetch('https://gen.pollinations.ai/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'openai', messages: [{ role: 'user', content: 'yo' }] })
});
```

keys expire in 30 days. users can revoke anytime from the dashboard.

---

[edit this doc](https://github.com/pollinations/pollinations/edit/main/BRING_YOUR_OWN_POLLEN.md) · *h/t [Puter.js](https://docs.puter.com/user-pays-model/) for the idea*
