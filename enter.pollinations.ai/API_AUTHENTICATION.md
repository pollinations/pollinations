# API Authentication Guide

## Overview

The Pollinations.AI API supports multiple authentication methods:
- **Bearer Token (Server-to-Server)** - Recommended for backend applications
- **Front-End Keys** - For client-side applications (limited features)
- **Anonymous Access** - No authentication required for free models

## Creating an API Key

1. Sign in at [enter.pollinations.ai](https://enter.pollinations.ai)
2. Navigate to your dashboard
3. Click "Create API Key"
4. Choose your key type:
   - **Server-to-Server**: For backend services (full access)
   - **Front-End**: For browser/mobile apps (limited to free models currently)
5. Copy your API key immediately - it won't be shown again!

## Using Your API Key

### Server-to-Server Authentication

Include your API key in the `Authorization` header as a Bearer token:

```bash
curl -X POST https://enter.pollinations.ai/api/generate/openai \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [
      {"role": "user", "content": "Hello, world!"}
    ]
  }'
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

| Feature | Anonymous | Front-End Key | Server-to-Server Key |
|---------|-----------|---------------|---------------------|
| Free Models | ✅ Standard limits | ✅ Better limits | ✅ Best limits |
| Premium Models | ❌ | ❌ (coming soon) | ✅ |
| Spend Pollen | ❌ | ❌ (coming soon) | ✅ |
| Rate Limits | Standard | Better | Best |
| Use Case | Testing | Client apps | Production backends |

## Rate Limits

Rate limits vary by authentication method and user tier:
- **Anonymous**: Standard rate limits
- **Front-End Keys**: Improved rate limits for free models
- **Server-to-Server Keys**: Best rate limits, configurable based on your tier

## Pollen Balance

Server-to-Server keys can spend Pollen (prepaid credits) on premium models:
- **$1 ≈ 1 Pollen**
- Premium models deduct Pollen per request
- Free models never cost Pollen
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
