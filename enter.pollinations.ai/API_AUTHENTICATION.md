# API Authentication Guide

## Overview

The Pollinations.AI API supports multiple authentication methods:
- **Server Keys (🔒)** - For backend applications with full access to all models
- **Frontend Keys (🌐)** - For client-side applications with access to all models (IP-based rate limiting)
- **Anonymous Access** - No authentication required for free models

## Creating an API Key

1. Sign in at [enter.pollinations.ai](https://enter.pollinations.ai)
2. Navigate to your dashboard
3. Click "Create API Key"
4. Choose your key type:
   - **🔒 Server Key**: For backend services (never expose publicly, can spend Pollen on premium models)
   - **🌐 Frontend Key**: For browser/mobile apps (safe to expose, access to all models with IP-based rate limiting)
5. Copy your API key immediately:
   - **Frontend keys**: Always visible in your dashboard (starts with `pk_`)
   - **Server keys**: Only shown once during creation (starts with `sk_`)

## Using Your API Key

Both frontend and server keys use the same authentication method - include your API key in the `Authorization` header as a Bearer token:

```bash
curl -X POST https://enter.pollinations.ai/openai \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [
      {"role": "user", "content": "Hello, world!"}
    ]
  }'
```

### Frontend Key Example (React)

```javascript
// ✅ Safe to use in client-side code
const FRONTEND_API_KEY = "pk_your_frontend_key_here";

const response = await fetch("https://enter.pollinations.ai/openai", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${FRONTEND_API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "openai",
    messages: [
      { role: "user", content: "Hello from React!" }
    ]
  })
});

const data = await response.json();
console.log(data);
```

### Python Example

```python
import requests

API_KEY = "your_api_key_here"
API_URL = "https://enter.pollinations.ai/api/generate/openai"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

data = {
    "model": "openai",
    "messages": [
        {"role": "user", "content": "Hello, world!"}
    ]
}

response = requests.post(API_URL, headers=headers, json=data)
print(response.json())
```

### JavaScript/Node.js Example

```javascript
const API_KEY = "your_api_key_here";
const API_URL = "https://enter.pollinations.ai/api/generate/openai";

const response = await fetch(API_URL, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "openai",
    messages: [
      { role: "user", content: "Hello, world!" }
    ]
  })
});

const data = await response.json();
console.log(data);
```

### Image Generation Example

```bash
curl https://enter.pollinations.ai/api/generate/image/a-beautiful-sunset \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -o sunset.png
```

## Key Types Comparison

| Feature | Anonymous | Frontend Key (🌐) | Server Key (🔒) |
|---------|-----------|-------------------|-----------------|
| All Models | ✅ Free only | ✅ All models | ✅ All models |
| Spend Pollen | ❌ | ❌ | ✅ |
| Rate Limiting | IP-based | IP-based (100 req/min) | User-based (best) |
| Safe to Expose | ✅ | ✅ | ❌ Never |
| Key Visibility | N/A | Always visible | One-time only |
| Key Prefix | N/A | `pk_` | `sk_` |
| Use Case | Testing | Client apps | Production backends |

## Rate Limits

Rate limits vary by authentication method:
- **Anonymous**: IP-based rate limiting
- **Frontend Keys**: IP-based rate limiting (100 requests/minute per IP)
- **Server Keys**: User-based rate limiting (best limits, configurable based on your tier)

## Pollen Balance

Server keys can spend Pollen (prepaid credits) on premium models:
- **$1 ≈ 1 Pollen**
- Premium models deduct Pollen per request
- Free models never cost Pollen
- Frontend keys **cannot** spend Pollen (all models are free for frontend keys)
- Check your balance at [enter.pollinations.ai](https://enter.pollinations.ai)

## Security Best Practices

### ✅ DO:
- Store API keys in environment variables
- Use Server-to-Server keys only in backend code
- Rotate keys regularly
- Delete unused keys from your dashboard

### ❌ DON'T:
- Commit API keys to version control
- Expose Server-to-Server keys in client-side code
- Share keys publicly or with untrusted parties
- Use the same key across multiple projects (create separate keys)

## Error Responses

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing API key"
}
```

**Solution**: Check that your API key is correct and included in the `Authorization` header.

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "Insufficient Pollen balance"
}
```

**Solution**: Add Pollen to your account at [enter.pollinations.ai](https://enter.pollinations.ai).

### 429 Too Many Requests
```json
{
  "error": "Rate Limit Exceeded",
  "message": "Too many requests. Please try again later."
}
```

**Solution**: Wait before making more requests, or upgrade your tier for higher limits.

## API Documentation

Full API documentation with interactive examples is available at:
**https://enter.pollinations.ai/api/docs**

## Support

- **Discord**: [discord.gg/pollinations](https://discord.gg/pollinations)
- **GitHub Issues**: [github.com/pollinations/pollinations/issues](https://github.com/pollinations/pollinations/issues)
- **Email**: support@pollinations.ai
