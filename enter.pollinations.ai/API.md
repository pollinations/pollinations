# API Documentation

## Authentication

### API Keys (Server-to-Server)

API keys enable server-to-server authentication with the best rate limits and access to all models including paid ones.

#### Creating an API Key

1. Sign in at [enter.pollinations.ai](https://enter.pollinations.ai)
2. Navigate to your dashboard
3. Click "Create new key"
4. Give your key a name and optional description
5. Copy the key immediately - it will only be shown once

#### Using API Keys

Include your API key in the `Authorization` header as a Bearer token:

```bash
Authorization: Bearer <your-api-key>
```

**Security:** Treat API keys like passwords. Never commit them to version control or expose them in client-side code.

## Endpoints

Base URL: `https://enter.pollinations.ai/api`

### Text Generation

#### POST /generate/openai

OpenAI-compatible endpoint for text generation.

**Headers:**
```
Authorization: Bearer <your-api-key>
Content-Type: application/json
```

**Request Body:**
```json
{
  "model": "openai",
  "messages": [
    {
      "role": "user",
      "content": "Your prompt here"
    }
  ]
}
```

**Example:**
```bash
curl -X POST https://enter.pollinations.ai/api/generate/openai \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

**Alias:** Also available at `/generate/openai/chat/completions`

#### GET /generate/openai/models

Get list of available text models.

**Example:**
```bash
curl https://enter.pollinations.ai/api/generate/openai/models
```

### Image Generation

#### GET /generate/image/:prompt

Generate an image from a text prompt.

**Headers:**
```
Authorization: Bearer <your-api-key>
```

**Query Parameters:**
- `model` - Image model to use (default: flux)
- `seed` - Random seed for reproducibility
- `width` - Image width
- `height` - Image height
- `nologo` - Remove watermark (true/false)
- `private` - Private generation (true/false)
- `enhance` - Enhance prompt (true/false)

**Example:**
```bash
curl -H "Authorization: Bearer <your-api-key>" \
  "https://enter.pollinations.ai/api/generate/image/a%20beautiful%20sunset?model=flux&width=1024&height=768"
```

#### GET /generate/image/models

Get list of available image models.

**Example:**
```bash
curl https://enter.pollinations.ai/api/generate/image/models
```

## Rate Limits

Rate limits depend on your authentication method:

- **Anonymous:** Standard rate limits, free models only
- **Front-End Key:** Better rate limits, free models only
- **Server-to-Server Key:** Best rate limits, access to all models

## Pollen Credits

Server-to-Server keys can spend Pollen credits for premium models:

- Free models (like flux) always cost 0 Pollen
- Premium models deduct from your Pollen balance
- See [POLLEN_FAQ.md](./POLLEN_FAQ.md) for pricing details

## Interactive Documentation

Interactive API documentation with live testing is available at:

https://enter.pollinations.ai/api/docs

## Error Responses

All endpoints return standard HTTP status codes:

- `200` - Success
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (missing or invalid API key)
- `500` - Internal Server Error

Error responses include a JSON body with details:

```json
{
  "error": "Error message here"
}
```
