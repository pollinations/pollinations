# Bring Your Own Pollen (BYOP) 🌸

Users pay for their own AI usage. You pay $0. Ship apps without API costs fr fr ✨

## The Flow

1. User taps "Connect with Pollinations"
2. They sign in → get a temp API key
3. Their pollen, your app

## Why it slaps

- **$0 costs** — 1 user or 1000, same price: free
- **No key drama** — auth flow handles it
- **Self-regulating** — everyone pays for their own usage
- **Frontend only** — no backend needed

## URLs

Say your app is at `https://myapp.com`

**You redirect user to:**
```
https://enter.pollinations.ai/authorize?redirect_url=https://myapp.com
```

**We redirect back with key:**
```
https://myapp.com#api_key=sk_abc123xyz
```

> Key is in the `#` fragment so it never hits server logs 🔒

**What users see:**

![Authorize Screen](./authorize-screen.png)

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

*h/t [Puter.js](https://docs.puter.com/user-pays-model/) for pioneering this*
