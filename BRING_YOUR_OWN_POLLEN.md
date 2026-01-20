# Bring Your Own Pollen (BYOP) 🌸

Users pay for their own AI usage. You pay €0. Ship apps without API costs.

## The Flow

1. User taps "Connect with Pollinations"
2. They sign in → get a temp API key
3. Their pollen, your app

## Why BYOP?

- **€0 costs** — 1 user or 1000, same price: free
- **No key drama** — auth flow handles it
- **Self-regulating** — everyone pays for their own usage
- **Frontend only** — no backend needed

![Authorize Screen](https://raw.githubusercontent.com/pollinations/pollinations/main/enter.pollinations.ai/public/authorize-screen.png)

## URLs

Say your app is at `https://myapp.com`

**Auth link:**
```
https://enter.pollinations.ai/authorize?redirect_url=https://myapp.com
```

**With preselected options:**
```
https://enter.pollinations.ai/authorize?redirect_url=https://myapp.com&permissions=profile,balance&models=flux,openai&expiry=7&budget=10
```

| Param | Description | Example |
|-------|-------------|---------|
| `models` | Allowed models (comma-separated) | `flux,openai,gptimage` |
| `budget` | Pollen budget limit | `10` |
| `expiry` | Key expiry in days (default: 30) | `7` |
| `permissions` | Account permissions | `profile,balance,usage` |

**Redirect back:**
```
https://myapp.com#api_key=sk_abc123xyz
```

> Key is in the `#` fragment — never hits server logs 🔒

## Code

```javascript
// 1. Send user to auth
window.location.href = `https://enter.pollinations.ai/authorize?redirect_url=${encodeURIComponent(location.href)}`;

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
