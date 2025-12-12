# Pollinations.AI API Docs 🌸

**New unified gateway** — All APIs now run through [`enter.pollinations.ai`](https://enter.pollinations.ai) with a short alias at [`gen.pollinations.ai`](https://gen.pollinations.ai). Both domains expose the same OpenAI-compatible surface.

- **Short base URL (recommended):** `https://gen.pollinations.ai`
- **Full base URL:** `https://enter.pollinations.ai/api`
- **Interactive docs:** https://gen.pollinations.ai/api/docs

## Authentication
- Get your API key from https://enter.pollinations.ai (Publishable keys start with `pk_`, Secret keys start with `sk_`).
- Send it as `Authorization: Bearer YOUR_KEY` or append `?key=YOUR_KEY` to the request URL.
- **Publishable (`pk_`)**: safe for clients, IP+key rate limited.  **Secret (`sk_`)**: server-side only, required for spending pollen on paid models.

```bash
export TOKEN="sk_or_pk_from_dashboard"
export BASE="https://gen.pollinations.ai"
```

## Quick Start

```bash
# Generate an image (defaults to flux, 1024x1024, seed=42)
curl "$BASE/image/hello-world?model=flux&width=1024&height=1024" \
  -H "Authorization: Bearer $TOKEN" \
  -o hello.jpg

# Chat completion (OpenAI-compatible)
curl "$BASE/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [{"role": "user", "content": "Tell me a fun fact about pollinators."}],
    "stream": false
  }'
```

## Model Discovery
- **Image models:** `GET $BASE/image/models`
- **Text/Chat models:** `GET $BASE/v1/models`

Always pick model IDs from these endpoints before using them.

---

## Image Generation
**Endpoint:** `GET $BASE/image/{prompt}` (or `GET https://enter.pollinations.ai/api/generate/image/{prompt}`)

| Parameter | Description | Default |
|-----------|-------------|---------|
| `model` | Image model (`flux` default; also `gptimage`, `turbo`, `kontext`, `seedream`) | flux |
| `width`, `height` | Image dimensions in pixels | 1024 |
| `seed` | Random seed for repeatable outputs | 42 |
| `quality` | `low`, `medium` (default), `high`, `hd` | medium |
| `enhance` | Let AI enhance the prompt | false |
| `nologo` | Remove watermark (requires paid/pollen) | false |
| `private`/`nofeed` | Hide from feeds | false |
| `safe` | Enable strict NSFW filtering | false |
| `image` | URL for image-to-image | - |
| `transparent` | Request transparent background | false |
| `key` | API key (alternative to header) | - |

```bash
# Transparent image-to-image
curl "$BASE/image/turn-this-into-a-watercolor?model=flux&image=https://example.com/photo.jpg&transparent=true" \
  -H "Authorization: Bearer $TOKEN" \
  -o transformed.png
```

```python
import requests
from urllib.parse import quote

BASE = "https://gen.pollinations.ai"
TOKEN = "YOUR_KEY"

prompt = "A serene mountain landscape at sunrise"
url = f"{BASE}/image/{quote(prompt)}"
params = {"width": 1280, "height": 720, "model": "flux"}
resp = requests.get(url, params=params, headers={"Authorization": f"Bearer {TOKEN}"}, timeout=120)
open("mountain.jpg", "wb").write(resp.content)
```

---

## Text & Chat Completions (OpenAI Compatible)
**Endpoint:** `POST $BASE/v1/chat/completions`

```bash
curl "$BASE/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [
      {"role": "system", "content": "You are a concise assistant."},
      {"role": "user", "content": "Summarize why pollen matters."}
    ],
    "temperature": 0.7,
    "reasoning_effort": "medium"
  }'
```

### Streaming
Set `"stream": true` to receive server-sent chunks.

### Simple Text Endpoint
`GET $BASE/text/{prompt}` remains available for quick one-off generations:
```bash
curl "$BASE/text/Write%20a%20haiku%20about%20bees?model=openai&temperature=0.8" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Audio (Text ↔ Speech)
Use `openai-audio` via chat completions with modalities.

```bash
curl "$BASE/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai-audio",
    "messages": [{"role": "user", "content": "Say hello to the Pollinations community"}],
    "modalities": ["text", "audio"],
    "audio": {"voice": "nova", "format": "mp3"}
  }'
```

---

## Vision & Multimodal

```bash
curl "$BASE/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "What is in this image?"},
        {"type": "image_url", "image_url": {"url": "https://example.com/sunset.jpg"}}
      ]
    }]
  }'
```

---

## Function Calling

```bash
curl "$BASE/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [{"role": "user", "content": "Weather in Tokyo?"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather for a city",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string"},
            "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
          },
          "required": ["location"]
        }
      }
    }]
  }'
```

---

## Best Practices
- Use `https://gen.pollinations.ai` for the shortest URLs; it proxies directly to `enter.pollinations.ai` with zero extra latency.
- Prefer Secret keys (`sk_`) on server-side workloads; Publishable keys (`pk_`) are rate limited per IP.
- Always fetch available models before calling them.
- Paid models (e.g., `gptimage`) spend pollen from your account; keep an eye on your balance in the dashboard.
- Add small delays when batch-generating images to avoid backend overload.

## Support & Resources
- Dashboard & keys: https://enter.pollinations.ai
- API docs: https://gen.pollinations.ai/api/docs
- React hooks: https://react-hooks.pollinations.ai
- Community updates: https://pollinations.ai/news

## License
MIT License — Made with ❤️ by the Pollinations.AI community.
