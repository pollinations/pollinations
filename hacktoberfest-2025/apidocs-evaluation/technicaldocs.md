# Pollinations.AI API Documentation

## Overview

Pollinations.AI is an open, multimodal AI platform for generating text, images, and audio via simple HTTP endpoints. No authentication is required for basic use.

## Quick Start

Try these direct examples in your browser:

- **Image:** `https://image.pollinations.ai/prompt/cat_in_sunglasses`
- **Text:** `https://text.pollinations.ai/Write%20a%20haiku%20about%20AI`
- **Audio:** `https://text.pollinations.ai/Hello%20world?model=openai-audio&voice=nova`

## Endpoints

### 1. Image Generation

`GET https://image.pollinations.ai/prompt/{prompt}`

**Parameters:**

| Name    | Type   | Description                        | Default |
| ------- | ------ | ---------------------------------- | ------- |
| prompt  | string | Text prompt (required)             | -       |
| model   | string | Model name (`flux`, `turbo`, etc.) | flux    |
| width   | int    | Image width in px                  | 1024    |
| height  | int    | Image height in px                 | 1024    |
| seed    | int    | Deterministic seed                 | random  |
| nologo  | bool   | Removes watermark                  | false   |
| enhance | bool   | Auto-improve prompt                | false   |
| private | bool   | Hide from public feed              | false   |

**Example:**

```bash
curl -o city.jpg "https://image.pollinations.ai/prompt/cyberpunk%20city?width=1920&height=1080&model=flux"
```

### 2. Text Generation

`GET https://text.pollinations.ai/{prompt}`

**Parameters:**

| Name        | Type   | Description                     | Default       |
| ----------- | ------ | ------------------------------- | ------------- |
| prompt      | string | Query or instruction (required) | -             |
| model       | string | Model name                      | openai        |
| seed        | int    | Consistent results              | random        |
| temperature | float  | Creativity control (0.0–3.0)    | model default |
| system      | string | System instruction              | -             |
| json        | bool   | JSON response                   | false         |
| stream      | bool   | Stream output                   | false         |

**Example:**

```bash
curl "https://text.pollinations.ai/Explain%20quantum%20computing?model=mistral&temperature=0.7"
```

#### OpenAI-Compatible Mode

`POST https://text.pollinations.ai/openai`

**Request:**

```json
{
  "model": "openai",
  "messages": [
    {"role": "system", "content": "You are a tutor."},
    {"role": "user", "content": "Explain gravity."}
  ],
  "temperature": 0.7,
  "max_tokens": 500,
  "stream": false
}
```

### 3. Audio Generation

**Text-to-Speech:** `GET https://text.pollinations.ai/{text}?model=openai-audio&voice={voice}`

**Voices:** alloy, echo, fable, onyx, nova, shimmer.

**Example:**

```bash
curl -o speech.mp3 "https://text.pollinations.ai/Hello?model=openai-audio&voice=nova"
```

**Speech-to-Text:** `POST https://text.pollinations.ai/openai`

Send base64-encoded audio input:

```json
{
  "model": "openai-audio",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "Transcribe this:"},
      {"type": "input_audio", "input_audio": {"data": "base64_audio", "format": "wav"}}
    ]
  }]
}
```

### 4. Vision / Multimodal

Send an image for description or Q&A.

**Example:**

```python
payload = {
  "model": "openai",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "Describe this."},
      {"type": "image_url", "image_url": {"url": "https://example.com/photo.jpg"}}
    ]
  }]
}
```

### 5. Function Calling

Allows AI to invoke external functions.

**Example:**

```json
{
  "model": "openai",
  "messages": [{"role": "user", "content": "What's the weather in Tokyo?"}],
  "tools": [{
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "Get current weather for a location",
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
}
```

### 6. Real-Time Feeds

| Feed  | Endpoint                                 | Description               |
| ----- | ---------------------------------------- | ------------------------- |
| Image | `GET https://image.pollinations.ai/feed` | Live stream of new images |
| Text  | `GET https://text.pollinations.ai/feed`  | Stream of text responses  |

### 7. React Integration

Install: `npm install @pollinations/react`

**Hooks:**

- `usePollinationsImage(prompt, options)` → Returns image URL.
- `usePollinationsText(prompt, options)` → Returns text.
- `usePollinationsChat(messages, options)` → Returns chat interface state.

### 8. Authentication & Rate Limits

| Tier      | Limit       | Models   | Notes             |
| --------- | ----------- | -------- | ----------------- |
| Anonymous | 1 req / 15s | Basic    | No signup         |
| Seed      | 1 req / 5s  | Standard | Free registration |
| Flower    | 1 req / 3s  | Advanced | Paid              |
| Nectar    | Unlimited   | All      | Enterprise        |

- Referrer-based auth for web.
- Bearer tokens for backend: `Authorization: Bearer <token>`.

### 9. Advanced Features

- **Image-to-Image (model=kontext)** – transform existing images.
- **Safe Filtering:** `safe=true` for strict content filtering.
- **Reasoning Control:** `reasoning_effort` = minimal | low | medium | high.

### 10. Best Practices

- Use `seed` for reproducibility.
- Enable `stream` for large responses.
- Cache results to reduce latency.
- Avoid exposing API tokens client-side.

### 11. Resources

- Docs: [github.com/pollinations/pollinations](https://github.com/pollinations/pollinations)
- Auth: [auth.pollinations.ai](https://auth.pollinations.ai)
- React Playground: [react-hooks.pollinations.ai](https://react-hooks.pollinations.ai)

**License:** MIT

