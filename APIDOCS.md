# 🌸 Pollinations.ai API Documentation

**Base URL:** `https://gen.pollinations.ai`

## 🔐 Authentication

All requests to the API require authentication via HTTP Headers.

1.  **Get an API Key:** Visit [enter.pollinations.ai](https://enter.pollinations.ai) to generate your key.
2.  **Key Types:**
    *   **`pk_...` (Publishable Key):** Safe for client-side code. Rate-limited by IP address.
    *   **`sk_...` (Secret Key):** Server-side only. No rate limits. Consumes Pollen balance.

**Required Headers:**
```http
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

---

## 1. Universal Chat Endpoint
**Endpoint:** `POST /v1/chat/completions`

This single OpenAI-compatible endpoint handles:
*   **Text Generation** (Chat, Coding, Reasoning)
*   **Vision** (Image understanding)
*   **Audio** (Text-to-Speech & Speech-to-Speech)
*   **Tool Use** (Web Search, Code Execution)

### A. Request Body Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `model` | string | **Yes** | The Model ID (see list below). |
| `messages` | array | **Yes** | List of message objects: `[{ "role": "user", "content": "..." }]`. |
| `tools` | array | No | specific tool definitions (e.g., Google Search). |
| `stream` | boolean | No | If `true`, streams the response via Server-Sent Events (SSE). |
| `temperature` | float | No | Controls randomness (`0.0` = strict, `2.0` = creative). Default: `1.0`. |
| `max_tokens` | integer | No | Maximum number of tokens to generate. |
| `seed` | integer | No | Integer for reproducible results. |
| `modalities` | array | No | Required for audio output: `["text", "audio"]`. |
| `audio` | object | No | Configuration for voice generation (see Text-to-Speech section). |

### B. Text Models List
*   `openai`
*   `openai-large`
*   `openai-fast`
*   `openai-audio`
*   `qwen-coder`
*   `mistral`
*   `gemini`
*   `gemini-large`
*   `gemini-fast`
*   `gemini-search`
*   `deepseek`
*   `grok`
*   `chickytutor`
*   `claude`
*   `claude-large`
*   `claude-fast`
*   `perplexity-reasoning`
*   `kimi-k2-thinking`
*   `nova-micro`

---

### C. Use Case Examples

#### 1. Text-to-Text (Basic Chat)
```bash
curl -X POST "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [
      { "role": "system", "content": "You are a stoic philosopher." },
      { "role": "user", "content": "Give me advice on patience." }
    ]
  }'
```

#### 2. Gemini Tools: Enabling Google Search
You can force any Gemini model to use Google Search by passing the specific tool definition.

```bash
curl -X POST "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini",
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "google_search"
        }
      }
    ],
    "messages": [
      { "role": "user", "content": "What is the latest score of the NBA finals?" }
    ]
  }'
```
*Note: `gemini` and `gemini-large` also have Python code execution enabled by default for math/logic problems.*

#### 3. Vision (Text-to-Text with Image Input)
Send an image URL along with text for analysis.

```bash
curl -X POST "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [
      {
        "role": "user",
        "content": [
          { "type": "text", "text": "Extract the text from this image." },
          { "type": "image_url", "image_url": { "url": "https://example.com/receipt.jpg" } }
        ]
      }
    ]
  }'
```

#### 4. Text-to-Speech (Audio Output)
Generate spoken audio.

```bash
curl -X POST "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai-audio",
    "modalities": ["text", "audio"],
    "audio": {
      "voice": "alloy",
      "format": "mp3"
    },
    "messages": [
      { "role": "user", "content": "Welcome to our application!" }
    ]
  }'
```
*   **Voices:** `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`, `coral`, `verse`, `ballad`.
*   **Formats:** `wav`, `mp3`, `flac`, `opus`, `pcm16`.

#### 5. Speech-to-Speech (Audio Input & Output)
Send audio (Base64 encoded) and get audio back.

```bash
curl -X POST "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai-audio",
    "modalities": ["text", "audio"],
    "messages": [
      {
        "role": "user",
        "content": [
          { 
            "type": "input_audio", 
            "input_audio": { 
              "data": "BASE64_ENCODED_STRING...", 
              "format": "wav" 
            } 
          }
        ]
      }
    ]
  }'
```

---

## 2. Image & Video Generation Endpoint
**Endpoint:** `GET /image/{prompt}`

This endpoint generates media based on URL query parameters.

### A. Supported Models

**Image Models:**
*   `flux`
*   `zimage`
*   `gptimage`
*   `gptimage-large`
*   `nanobanana`
*   `nanobanana-pro`
*   `seedream`
*   `seedream-pro`
*   `turbo`
*   `kontext`

**Video Models:**
*   `veo` (Google DeepMind)
*   `seedance`
*   `seedance-pro`

### B. Universal Parameters (Query Strings)

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `model` | string | `flux` | The model ID from the list above. |
| `width` | int | `1024` | Output width in pixels. |
| `height` | int | `1024` | Output height in pixels. |
| `seed` | int | `0` | Seed for reproducibility. `-1` = Random. |
| `nologo` | boolean | `false` | `true` removes the watermark. |
| `private` | boolean | `false` | `true` prevents the image from appearing in the public feed. |
| `enhance` | boolean | `false` | `true` uses an LLM to rewrite/enrich your prompt. |
| `safe` | boolean | `false` | `true` enables strict NSFW filtering. |
| `negative_prompt`| string | - | What to exclude (e.g., "blurry, dark"). |
| `image` | string | - | Reference image URL(s). Comma-separated for multiple. |

---

### C. Use Case Examples

#### 1. Text-to-Image (Txt2Img)
```bash
curl "https://gen.pollinations.ai/image/A%20cyberpunk%20samurai?model=flux&width=1280&height=720&enhance=true&nologo=true" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### 2. Image-to-Image (Img2Img)
Modify an existing image.
```bash
curl "https://gen.pollinations.ai/image/Make%20it%20made%20of%20lego?model=flux&image=https://example.com/photo.jpg" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### 3. Text-to-Video (Txt2Video)
*   **Veo Duration:** 4, 6, or 8 seconds.
*   **Seedance Duration:** 2 to 10 seconds.

```bash
curl "https://gen.pollinations.ai/image/A%20drone%20flying%20over%20mountains?model=veo&duration=8&audio=true" \
  -H "Authorization: Bearer YOUR_API_KEY"
```
*Note: `audio=true` works specifically with `veo` to generate sound effects.*

#### 4. Image-to-Video (Animation)
Animate a single static image.
```bash
curl "https://gen.pollinations.ai/image/Make%20the%20waves%20move?model=seedance&image=https://example.com/ocean.jpg&duration=5" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### 5. Veo Special: Interpolation (First & Last Frame)
Generate a video that morphs from a start frame to an end frame. Provide two URLs separated by a comma (or pipe `|`).

```bash
curl "https://gen.pollinations.ai/image/Morph?model=veo&image=https://site.com/start.jpg,https://site.com/end.jpg&duration=8" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## 3. Error Codes & Reasons

The API returns standard HTTP status codes indicating success or failure.

| Status | Error Code | Reason |
| :--- | :--- | :--- |
| **400** | `BAD_REQUEST` | **Invalid Parameters:** <br>- Width/Height too large (max usually 2048).<br>- Missing `prompt`.<br>- Invalid `model` name.<br>- Malformed JSON in POST body. |
| **401** | `UNAUTHORIZED` | **Authentication Failed:**<br>- Missing `Authorization` header.<br>- Invalid API Key.<br>- Key has been revoked. |
| **429** | `TOO_MANY_REQUESTS`| **Rate Limit:**<br>- Using a Publishable Key (`pk_`) and exceeded IP limits.<br>- **Solution:** Upgrade to a Secret Key (`sk_`) or wait. |
| **500** | `INTERNAL_ERROR` | **Provider Error:**<br>- The underlying AI provider (OpenAI, Google, etc.) is experiencing downtime.<br>- The model failed to generate the specific request. |
| **500** | `CONTENT_FILTER` | **Safety Violation:**<br>- The prompt or input image was flagged by safety filters (NSFW, violence, hate speech). |
