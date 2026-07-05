<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-text-white.svg">
  <img alt="Pollinations" src="assets/logo-text-black.svg" width="420">
</picture>

> Generate text, images, video, audio, realtime voice, and embeddings with a single API. OpenAI-compatible — use any OpenAI SDK by changing the base URL.

# API docs

**Version:** `0.3.0` · **OpenAPI:** `3.1.0` · **Base URL:** `https://gen.pollinations.ai`

## 🚀 Getting Started

**1. Get an API key** at [enter.pollinations.ai](https://enter.pollinations.ai). Two key types are available:

- `sk_*` — secret key for backend use
- `pk_*` — publishable key, safe to ship in browsers and mobile apps when scoped appropriately

**2. Send the key** in the `Authorization` header (or as `?key=` query param for GET endpoints):

```bash
curl https://gen.pollinations.ai/v1/models \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

**3. Pick an endpoint** from the [📑 Contents](#-contents) below.

**Integration guides:** [🌸 BYOP](https://gen.pollinations.ai/docs#tag/byop) · [🖥️ CLI](https://gen.pollinations.ai/docs#tag/cli) · [🔌 MCP Server](https://gen.pollinations.ai/docs#tag/mcp-server)

## 📑 Contents

- [🚀 Getting Started](#-getting-started)
- [🔐 Authentication](#-authentication)
- [🧪 Use any OpenAI SDK](#-use-any-openai-sdk)
- [🌊 Streaming chat completions](#-streaming-chat-completions)
- [🖼️ Vision: passing images into chat](#-vision-passing-images-into-chat)
- [📤 Multipart uploads in depth](#-multipart-uploads-in-depth)
- [💡 Tips](#-tips)
- [🛠️ Endpoints](#-endpoints)
  - [✍️ Text](#-text)
  - [🖼️ Image](#-image)
  - [🎬 Video](#-video)
  - [🧊 3D](#-3d)
  - [🔊 Audio](#-audio)
  - [🎙️ Realtime](#-realtime)
  - [🔢 Embeddings](#-embeddings)
  - [🤖 Models](#-models)
  - [📦 Media Storage](#-media-storage)
  - [👤 Account](#-account)
- [⚠️ Error Responses](#-error-responses)
- [🧩 Schemas](#-schemas)

## 🔐 Authentication

Pollinations recognises two key types. Use the right one for the surface you're building.

| Key type | Prefix | Where it goes | What it can do |
|---|---|---|---|
| Secret key | `sk_` | Server-only (env var, secrets manager) | Backend generation and account APIs allowed by the key's permissions and budget. **Never ship to a browser, mobile app, or repo.** |
| Publishable key | `pk_` | Browsers, mobile apps, public clients | Calls models on behalf of the developer who created the key. Restricted to the permissions and budget set at creation. A key with `account:keys` is account-admin, so do not expose one publicly. |

Both forms accept the same transports:

```http
Authorization: Bearer <key>
```

```http
GET /image/cat?key=<key>
```

The header is preferred for everything except browser flows that can't set custom headers (image/audio `GET` endpoints and WebSocket realtime sessions).

**Endpoints with relaxed auth requirements**

| Endpoint | Auth |
|---|---|
| `GET /{hash}`, `GET /{hash}/metadata`, `HEAD /{hash}` | None — content-addressed media URLs are public reads |
| `GET /models`, `GET /v1/models`, `GET /image/models`, `GET /text/models`, `GET /audio/models`, `GET /embeddings/models` | None — model catalogue is public. Sending a bearer key returns the same data; some endpoints add per-account fields when authenticated. |
| Everything else | Bearer key required unless the endpoint documents `?key=` support |

`401 UNAUTHORIZED` always means key missing or invalid. `402 PAYMENT_REQUIRED` means the key authenticated but the account or per-key budget is exhausted — see [Error Responses](#-error-responses).

## 🧪 Use any OpenAI SDK

Pollinations speaks the OpenAI Chat Completions, Images, Embeddings, Audio, and Realtime APIs. Point the SDK at `https://gen.pollinations.ai/v1` and pass your `sk_…` key as the OpenAI key.

**Python**

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://gen.pollinations.ai/v1",
    api_key="sk_your_secret_key",
)

response = client.chat.completions.create(
    model="openai",
    messages=[{"role": "user", "content": "Summarise the theory of relativity in one sentence."}],
)
print(response.choices[0].message.content)
```

**Node.js / TypeScript**

```ts
import OpenAI from "openai";

const client = new OpenAI({
    baseURL: "https://gen.pollinations.ai/v1",
    apiKey: process.env.POLLINATIONS_KEY,
});

const response = await client.chat.completions.create({
    model: "openai",
    messages: [{ role: "user", content: "Summarise the theory of relativity in one sentence." }],
});
console.log(response.choices[0].message.content);
```

Model IDs come from `GET /v1/models`. Anything `openai`, `claude`, `mistral`, `deepseek`, etc. routes to the corresponding provider on our side — you don't need separate keys per provider.

## 🌊 Streaming chat completions

Set `stream: true` to receive Server-Sent Events (SSE) deltas as the model writes. The wire format is byte-for-byte the OpenAI streaming format, so any OpenAI SDK that supports streaming works unchanged.

**cURL**

```bash
curl -N "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai","stream":true,"messages":[{"role":"user","content":"Count to five, one word per line."}]}'
```

`-N` disables curl's output buffering so deltas appear as they arrive. Each event is a line of the form `data: {…}` terminated by `data: [DONE]`.

**Python (OpenAI SDK)**

```python
stream = client.chat.completions.create(
    model="openai",
    stream=True,
    messages=[{"role": "user", "content": "Count to five, one word per line."}],
)
for chunk in stream:
    delta = chunk.choices[0].delta.content
    if delta:
        print(delta, end="", flush=True)
```

When `stream: true` is set, usage info still arrives on the final chunk (`stream_options: { include_usage: true }` if your SDK requires opting in).

## 🖼️ Vision: passing images into chat

Models that accept image input (`openai`, `claude`, `gemini`, …) use the standard OpenAI multimodal `content` shape — an array of typed parts instead of a plain string.

```bash
curl "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "What is in this image?"},
        {"type": "image_url", "image_url": {"url": "https://example.com/cat.jpg"}}
      ]
    }]
  }'
```

`image_url.url` accepts either a public URL or a `data:image/...;base64,…` data URI. Use `detail: "high"` for fine-grained reasoning and `"low"` for quick takes — see the [`MessageContentPart`](#messagecontentpart) schema for every supported part.

For audio or video input, swap in `input_audio` or `video_url` parts on models that advertise the matching capability in their `/v1/models` entry.

## 📤 Multipart uploads in depth

Three endpoints accept `multipart/form-data` request bodies. Each has its own field set.

**Transcribe an audio file** — Whisper-compatible.

```bash
curl -X POST "https://gen.pollinations.ai/v1/audio/transcriptions" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -F "file=@./recording.mp3" \
  -F "model=openai-audio" \
  -F "response_format=verbose_json" \
  -F "temperature=0"
```

`response_format` accepts `json` (default), `verbose_json` (adds segment timings), `text`, `srt`, `vtt`. Max file size 25 MB.

**Edit an image with a prompt** — OpenAI Images Edits-compatible.

```bash
curl -X POST "https://gen.pollinations.ai/v1/images/edits" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -F "image=@./photo.png" \
  -F "prompt=replace the sky with a sunset" \
  -F "model=kontext" \
  -F "size=1024x1024"
```

Repeat `-F "image=@…"` to pass multiple reference images on models that accept them (`seedream`, `nanobanana`, `klein`).

**Upload arbitrary media** to the content-addressed store. Returns a `https://media.pollinations.ai/<hash>` URL you can pass anywhere a remote image, audio, or video URL is accepted.

```bash
curl -X POST "https://gen.pollinations.ai/upload" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -F "file=@./asset.png"
```

The hash is derived from the bytes **and** the filename, so the same content uploaded under different names yields different URLs. Files are retained for 30 days; re-uploading resets the timer (and is a no-op if the hash already exists — the `duplicate` field in the response tells you which).

## 💡 Tips

- **Use `pk_` keys in browsers.** Anywhere a `sk_` key could be read off the wire, use a publishable key with a tight budget and an allow-list of models.
- **One key per app.** Child keys scope budget and permissions independently — easier to audit, easier to revoke without touching production.
- **Image/audio `GET` URLs are cache-friendly.** They're idempotent on `(prompt, model, seed)` — cache them on a CDN if you serve the same generations to many users.
- **Watch `429` and `503`.** A `Retry-After` header tells you how long to back off. `502` from us means upstream provider — usually transient.

## 🛠️ Endpoints

### ✍️ Text

#### `POST` `/v1/chat/completions` — Chat Completions

Generate text responses using AI models. Fully compatible with the OpenAI Chat Completions API — use any OpenAI SDK by pointing it to `https://gen.pollinations.ai`.

Supports streaming, function calling, vision (image input), structured outputs, and reasoning/thinking modes depending on the model.

📥 **Request body** · `application/json`

| Field | Type | Description |
|---|---|---|
| `messages` * | `object`[] | — |
| `model` | `string` | AI model for text generation. See /v1/models for full list. · default: `"openai"` |
| `modalities` | `"text"` \| `"audio"`[] | — |
| `audio` | `object` | — |
| `audio.voice` * | enum (13) — `"alloy"`, `"echo"`, `"fable"`, … | — |
| `audio.format` * | `"wav"` \| `"mp3"` \| `"flac"` \| `"opus"` \| `"pcm16"` | — |
| `frequency_penalty` | `number` \| `null` | default: `0` |
| `repetition_penalty` | `number` \| `null` | — |
| `logit_bias` | `object` \| `null` | default: `null` |
| `logprobs` | `boolean` \| `null` | default: `false` |
| `top_logprobs` | `integer` \| `null` | — |
| `max_tokens` | `integer` \| `null` | — |
| `presence_penalty` | `number` \| `null` | default: `0` |
| `response_format` | `object` | — |
| `seed` | `integer` \| `null` | — |
| `stop` | `string` \| `null` \| `string`[] | — |
| `stream` | `boolean` \| `null` | default: `false` |
| `stream_options` | `object` \| `null` | — |
| `safe` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |
| `reasoning_effort` | enum (6) — `"none"`, `"minimal"`, `"low"`, … | Requests reasoning depth for models that support adjustable reasoning. "none" requests no reasoning. |
| `temperature` | `number` \| `null` | — |
| `top_p` | `number` \| `null` | — |
| `tools` | `object`[] | — |
| `tool_choice` | `"none"` \| `"auto"` \| `"required"` \| `object` | — |
| `parallel_tool_calls` | `boolean` | default: `true` |
| `user` | `string` | — |
| `function_call` | `"none"` \| `"auto"` \| `object` | — |
| `functions` | `object`[] | — |
| `functions[].description` | `string` | — |
| `functions[].name` * | `string` | — |
| `functions[].parameters` | `object` | — |

<sub>`*` = required field</sub>

📤 **Response** · `200` · `application/json` — Success

| Field | Type | Description |
|---|---|---|
| `id` * | `string` | — |
| `choices` * | `object`[] | — |
| `choices[].finish_reason` | `string` \| `null` | — |
| `choices[].index` | `integer` | — |
| `choices[].message` | `object` | — |
| `choices[].logprobs` | `object` \| `null` | — |
| `choices[].content_filter_results` | [`ContentFilterResult`](#contentfilterresult) \| `null` | — |
| `prompt_filter_results` | `object`[] \| `null` | — |
| `created` * | `integer` | — |
| `model` * | `string` | — |
| `system_fingerprint` | `string` \| `null` | — |
| `object` * | `"chat.completion"` | — |
| `usage` | [`CompletionUsage`](#completionusage) | — |
| `citations` | `string`[] | — |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl -X POST "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai","messages":[{"role":"user","content":"Hello!"}]}'
```

##### Prompt caching

On Gemini models, a large static prompt prefix can be cached so repeat requests bill it at ~10% of the input rate. Mark the end of the static prefix with `cache_control` on a content block (not on the message); everything before the marker must be byte-identical across requests, everything dynamic goes after.

```json
{
  "model": "gemini-fast",
  "messages": [
    {
      "role": "system",
      "content": [
        {
          "type": "text",
          "text": "<large static prompt>",
          "cache_control": { "type": "ephemeral" }
        }
      ]
    },
    { "role": "user", "content": "<dynamic message>" }
  ]
}
```

- The static prefix must be at least ~2048 tokens. Requests with tools are not cached — including built-in tools, so `gemini`, `gemini-3-flash`, `gemini-large`, and the search variants only cache when tools are disabled with `"tools": []`. `gemini-fast` and `gemini-flash-lite-3.1` cache by default.
- The first request creates the cache — `usage` reports `cache_creation_input_tokens`, billed at the standard input rate plus a storage fee for the 1-hour TTL ($1 per 1M cached tokens on Flash models, $4.50 on Pro). Requests within the TTL report `prompt_tokens_details.cached_tokens` at the discounted rate.
- Caching pays off when the prefix is reused often — on the cheapest models the storage fee outweighs the discount below roughly a dozen reuses per hour.

---

#### `POST` `/text` — Text Generation With Messages

Generate text from an OpenAI-style messages array and return the assistant content directly.

Use `/v1/chat/completions` when you need the full OpenAI-compatible JSON response.

📥 **Request body** · `application/json`

| Field | Type | Description |
|---|---|---|
| `messages` * | `object`[] | — |
| `model` | `string` | AI model for text generation. See /v1/models for full list. · default: `"openai"` |
| `modalities` | `"text"` \| `"audio"`[] | — |
| `audio` | `object` | — |
| `audio.voice` * | enum (13) — `"alloy"`, `"echo"`, `"fable"`, … | — |
| `audio.format` * | `"wav"` \| `"mp3"` \| `"flac"` \| `"opus"` \| `"pcm16"` | — |
| `frequency_penalty` | `number` \| `null` | default: `0` |
| `repetition_penalty` | `number` \| `null` | — |
| `logit_bias` | `object` \| `null` | default: `null` |
| `logprobs` | `boolean` \| `null` | default: `false` |
| `top_logprobs` | `integer` \| `null` | — |
| `max_tokens` | `integer` \| `null` | — |
| `presence_penalty` | `number` \| `null` | default: `0` |
| `response_format` | `object` | — |
| `seed` | `integer` \| `null` | — |
| `stop` | `string` \| `null` \| `string`[] | — |
| `stream` | `boolean` \| `null` | default: `false` |
| `stream_options` | `object` \| `null` | — |
| `safe` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |
| `reasoning_effort` | enum (6) — `"none"`, `"minimal"`, `"low"`, … | Requests reasoning depth for models that support adjustable reasoning. "none" requests no reasoning. |
| `temperature` | `number` \| `null` | — |
| `top_p` | `number` \| `null` | — |
| `tools` | `object`[] | — |
| `tool_choice` | `"none"` \| `"auto"` \| `"required"` \| `object` | — |
| `parallel_tool_calls` | `boolean` | default: `true` |
| `user` | `string` | — |
| `function_call` | `"none"` \| `"auto"` \| `object` | — |
| `functions` | `object`[] | — |
| `functions[].description` | `string` | — |
| `functions[].name` * | `string` | — |
| `functions[].parameters` | `object` | — |

<sub>`*` = required field</sub>

📤 **Response** · `200` — Generated text response, audio bytes, JSON message object, or SSE when stream=true

💻 **Example**

```bash
curl -X POST "https://gen.pollinations.ai/text" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello!"}],"model":"openai"}'
```

---

#### `GET` `/text/{prompt}` — Simple Text Generation

Generate text from a prompt via a simple GET request. Returns plain text.

This is a simplified alternative to the OpenAI-compatible `/v1/chat/completions` endpoint — ideal for quick prototyping or simple integrations.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `prompt` * | `path` | `string` | Text prompt for generation |
| `model` | `query` | `string` | Text model to use. See /v1/models or /text/models for the full list of available models. · default: `"openai"` |
| `seed` | `query` | `integer` | Seed for reproducible results. Use -1 for random. · default: `0` · min: `-1` |
| `system` | `query` | `string` | System prompt to set the model's behavior and context. Acts as initial instructions before the user prompt. |
| `json` | `query` | `boolean` | When true, the model returns valid JSON. Useful for structured data extraction. |
| `temperature` | `query` | `number` | Controls randomness. Lower values (e.g. 0.2) produce more focused output, higher values (e.g. 1.5) produce more creative output. Range: 0.0 to 2.0. |
| `stream` | `query` | `boolean` | Stream the response as it's generated, using Server-Sent Events (SSE). Each chunk contains partial text. |
| `safe` | `query` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `text/plain` — Generated text response

💻 **Example**

```bash
curl "https://gen.pollinations.ai/text/Write%20a%20haiku%20about%20coding?model=openai&seed=0" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

### 🖼️ Image

#### `GET` `/image/{prompt}` — Generate Image

Generate an image from a text prompt. Returns JPEG or PNG.

**Available models:** `kontext`, `nanobanana`, `nanobanana-2`, `nanobanana-pro`, `seedream5`, `seedream`, `seedream-pro`, `ideogram-v4-turbo`, `ideogram-v4-balanced`, `ideogram-v4-quality`, `gptimage`, `gptimage-large`, `gpt-image-2`, `flux`, `zimage`, `wan-image`, `wan-image-pro`, `qwen-image`, `grok-imagine`, `grok-imagine-pro`, `klein`, `p-image`, `p-image-edit`, `nova-canvas`. `zimage` is the default.

Browse all available models and their capabilities at [`/image/models`](https://gen.pollinations.ai/image/models).

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `prompt` * | `path` | `string` | Text description of the image to generate |
| `model` * | `query` | `string` | Model to use. **Image:** flux, zimage, gptimage, kontext, seedream5, nanobanana, nanobanana-pro, klein. **Video:** veo, seedance, seedance-pro, wan, nova-reel. See /image/models for full list. · default: `"zimage"` |
| `width` | `query` | `integer` | Width in pixels. For images, exact pixels. For video models, mapped to nearest resolution tier (480p/720p/1080p). · default: `1024` |
| `height` | `query` | `integer` | Height in pixels. For images, exact pixels. For video models, mapped to nearest resolution tier (480p/720p/1080p). · default: `1024` |
| `seed` | `query` | `integer` | Seed for reproducible results. Use -1 for random. Supported by: flux, zimage, seedream, klein, seedance, nova-reel. Other models ignore this parameter. · default: `0` · range: `-1…2147483647` |
| `safe` | `query` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |
| `quality` | `query` | `"low"` \| `"medium"` \| `"high"` \| `"hd"` | Image quality level. Only supported by `gptimage`, `gptimage-large`, and `gpt-image-2`. · default: `"medium"` |
| `image` | `query` | `string` | Reference image URL(s) for image editing or video generation. Separate multiple URLs with `\|` or `,`. **Image models:** Used for editing/style reference (kontext, gptimage, seedream, klein, nanobanana). **Video models:** `image[0]` = starting frame (I2V); `image[1]` = ending frame for first+last-frame interpolation. End-frame supported by `veo`, `seedance`, `seedance-2.0`, and `wan-fast`; other video models silently drop `image[1]`. See `video_capabilities` on `/image/models` or `/models` for per-model support. |
| `transparent` | `query` | `boolean` | Generate image with transparent background. Only supported by `gptimage`, `gptimage-large`, and `gpt-image-2`. · default: `false` |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `image/jpeg`, `image/png` — Success - Returns the generated image

💻 **Example**

```bash
curl "https://gen.pollinations.ai/image/a%20beautiful%20sunset%20over%20mountains?model=zimage&width=1024" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `POST` `/v1/images/generations` — Generate Image (OpenAI-compatible)

OpenAI-compatible image generation endpoint.

Generate images from text prompts. Supports `response_format: "url"` (returns a pollinations.ai URL) or `"b64_json"` (returns base64-encoded image data, default).

**Authentication:** Include your API key as `Authorization: Bearer YOUR_API_KEY`.

📥 **Request body** · `application/json`

| Field | Type | Description |
|---|---|---|
| `prompt` * | `string` | A text description of the desired image(s) · length: `1…32000` |
| `model` | `string` | The model to use for image generation · default: `"flux"` |
| `n` | `integer` | Number of images to generate (currently max 1) · default: `1` · range: `1…1` |
| `size` | `string` | Image size as WIDTHxHEIGHT (e.g., 1024x1024, 512x512) · default: `"1024x1024"` |
| `quality` | `"standard"` \| `"hd"` \| `"low"` \| `"medium"` \| `"high"` | Image quality. OpenAI 'standard'/'hd' mapped to Pollinations equivalents · default: `"medium"` |
| `response_format` | `"url"` \| `"b64_json"` | Return format. "url" returns a pollinations.ai URL, "b64_json" returns base64-encoded image data · default: `"b64_json"` |
| `user` | `string` | End-user identifier for abuse tracking |
| `image` | `string` \| `string`[] | Reference image URL(s) for image-to-image generation (Pollinations extension) |
| `safe` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |

<sub>`*` = required field</sub>

📤 **Response** · `200` · `application/json` — Success

Returns [`CreateImageResponse`](#createimageresponse).

💻 **Example**

```bash
curl -X POST "https://gen.pollinations.ai/v1/images/generations" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"a serene mountain landscape at sunset","model":"flux","size":"1024x1024"}'
```

---

#### `POST` `/v1/images/edits` — Edit Image (OpenAI-compatible)

OpenAI-compatible image editing endpoint.

Edit images using a text prompt and one or more source images.
Accepts JSON with image URLs or multipart/form-data with file uploads.

**Authentication:** Include your API key as `Authorization: Bearer YOUR_API_KEY`.

📤 **Response** · `200` · `application/json` — Success

Returns [`CreateImageResponse`](#createimageresponse).

💻 **Example**

```bash
curl -X POST "https://gen.pollinations.ai/v1/images/edits" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -F "image=@./input.png" \
  -F "prompt=make the sky a vivid sunset" \
  -F "model=kontext"
```

### 🎬 Video

#### `GET` `/video/{prompt}` — Generate Video

Generate a video from a text prompt. Returns MP4.

**Available models:** `veo`, `seedance-pro`, `seedance-2.0`, `wan`, `wan-fast`, `wan-pro`, `wan-pro-1080p`, `grok-video-pro`, `ltx-2`, `p-video-720p`, `p-video-1080p`, `nova-reel`.

Use `duration` to set video length, `aspectRatio` for orientation, and `audio` where the selected model supports audio output.

You can pass reference images via the `image` parameter: `image[0]` is the start frame, and `image[1]` is the end frame for models with `end_frame` in `video_capabilities`.

Browse all available models and their `video_capabilities` at [`/image/models`](https://gen.pollinations.ai/image/models).

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `prompt` * | `path` | `string` | Text description of the video to generate |
| `model` * | `query` | `string` | Model to use. **Image:** flux, zimage, gptimage, kontext, seedream5, nanobanana, nanobanana-pro, klein. **Video:** veo, seedance, seedance-pro, wan, nova-reel. See /image/models for full list. · default: `"zimage"` |
| `width` | `query` | `integer` | Width in pixels. For images, exact pixels. For video models, mapped to nearest resolution tier (480p/720p/1080p). · default: `1024` |
| `height` | `query` | `integer` | Height in pixels. For images, exact pixels. For video models, mapped to nearest resolution tier (480p/720p/1080p). · default: `1024` |
| `seed` | `query` | `integer` | Seed for reproducible results. Use -1 for random. Supported by: flux, zimage, seedream, klein, seedance, nova-reel. Other models ignore this parameter. · default: `0` · range: `-1…2147483647` |
| `safe` | `query` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |
| `image` | `query` | `string` | Reference image URL(s) for image editing or video generation. Separate multiple URLs with `\|` or `,`. **Image models:** Used for editing/style reference (kontext, gptimage, seedream, klein, nanobanana). **Video models:** `image[0]` = starting frame (I2V); `image[1]` = ending frame for first+last-frame interpolation. End-frame supported by `veo`, `seedance`, `seedance-2.0`, and `wan-fast`; other video models silently drop `image[1]`. See `video_capabilities` on `/image/models` or `/models` for per-model support. |
| `duration` | `query` | `integer` | Video duration in seconds. Only applies to video models. `veo`: 4, 6, or 8s. `seedance`: 2-10s. `seedance-2.0`: 4-15s. `wan`: 2-15s. `nova-reel`: 6-120s (multiples of 6). · range: `1…120` |
| `aspectRatio` | `query` | `string` | Video aspect ratio (`16:9` or `9:16`). Only applies to video models. If not set, determined by width/height. |
| `audio` | `query` | `boolean` | Generate audio for the video. Only applies to video models. Note: `wan` generates audio regardless of this flag. For `veo`, set to `true` to enable audio. · default: `false` |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `video/mp4` — Success - Returns the generated video

💻 **Example**

```bash
curl "https://gen.pollinations.ai/video/a%20sunset%20timelapse%20over%20the%20ocean?model=veo&width=1024" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

### 🧊 3D

#### `GET` `/3d/{prompt}` — Generate 3D Model

Generate a 3D model from a text prompt or reference image(s). Returns GLB by default.

**Available models:** `trellis-2-low`, `trellis-2-medium`, `trellis-2-high`, `hyper3d-rodin`. `trellis-2-low` is the default. All models return GLB.

Pass reference image URL(s) via the `image` parameter for image-to-3D models (`trellis-2-*`). Separate multiple URLs with `|` or `,`. `hyper3d-rodin` accepts both images and a text prompt.

Browse all available models and their input requirements at [`/3d/models`](https://gen.pollinations.ai/3d/models).

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `prompt` * | `path` | `string` | Text description of the 3D model to generate (required for text-to-3D models; ignored by image-only models) |
| `model` | `query` | `string` | Model to use. See /3d/models for the full list and per-model input requirements. · default: `"trellis-2-low"` |
| `image` | `query` | `string` | Reference image URL(s) for image-to-3D generation. Separate multiple URLs with `\|` or `,`. Required for `trellis-2-*` models. |
| `seed` | `query` | `integer` | Seed for varied generations. Passed through to models that support it (`hyper3d-rodin`); otherwise only affects the media-cache key, so a new seed forces a fresh generation for the same prompt/image. |
| `safe` | `query` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `model/gltf-binary` — Success - Returns the generated 3D model

💻 **Example**

```bash
curl "https://gen.pollinations.ai/3d/a%20low-poly%20treasure%20chest?model=trellis-2-low&image=https://example.com/ref.jpg" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  --output model.glb
```

### 🔊 Audio

#### `POST` `/v1/audio/speech` — Text to Speech (OpenAI-compatible)

Generate speech or music from text. Compatible with the OpenAI TTS API — use any OpenAI SDK.

Set `model` to `elevenmusic` to generate music instead of speech.

**Available voices:** alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, matilda, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill

**Output formats:** mp3 (default), opus, aac, flac, wav, pcm

📥 **Request body** · `application/json`

| Field | Type | Description |
|---|---|---|
| `model` | `string` | — |
| `input` * | `string` | The text to generate audio for. Maximum 4096 characters. · length: `1…4096` |
| `safe` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |
| `voice` | `string` | The voice to use. Can be any preset name (alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, matilda, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill) OR a custom ElevenLabs voice ID (UUID from your dashboard). · default: `"alloy"` |
| `response_format` | enum (6) — `"mp3"`, `"opus"`, `"aac"`, … | The audio format for the output. Qwen TTS currently returns WAV regardless of this setting. · default: `"mp3"` |
| `duration` | `number` | Music duration in seconds, 3-300 (elevenmusic/acestep) · range: `3…300` |
| `instrumental` | `boolean` | If true, guarantees instrumental output (elevenmusic only) |
| `seed` | `integer` | Seed for deterministic output. Same seed + params = best-effort return of the same cached result. Omit for random. · max: `4294967295` |
| `style` | `string` | Style/genre tags for music generation (acestep only). If omitted, style is auto-detected from the input text. |
| `instruct` | `string` | Emotion/style instruction (qwen-tts-instruct only). e.g. 'excited and cheerful'. |

<sub>`*` = required field</sub>

📤 **Response** · `200` · `audio/mpeg`, `audio/opus`, `audio/aac`, `audio/flac`, `audio/wav` — Success - Returns audio data

💻 **Example**

```bash
curl -X POST "https://gen.pollinations.ai/v1/audio/speech" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":"Hello, welcome to Pollinations!"}'
```

---

#### `POST` `/v1/audio/transcriptions` — Transcribe Audio

Transcribe audio files to text. Compatible with the OpenAI Whisper API.

**Supported audio formats:** mp3, mp4, mpeg, mpga, m4a, wav, webm

**Models:**
- `whisper-large-v3` (default) — OpenAI Whisper via OVHcloud
- `whisper-1` — Alias for whisper-large-v3
- `scribe` — ElevenLabs Scribe (90+ languages, word-level timestamps)
- `universal-2` — AssemblyAI Universal-2 (99 languages)
- `universal-3-pro` — AssemblyAI Universal-3 Pro (highest accuracy, prompting)

📥 **Request body** · `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `file` * | `string · binary` | The audio file to transcribe. Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm. |
| `model` | `string` | The model to use. Options: `whisper-large-v3`, `whisper-1`, `scribe`, `universal-2`, `universal-3-pro`. · default: `"whisper-large-v3"` |
| `language` | `string` | Language of the audio in ISO-639-1 format (e.g. `en`, `fr`). Improves accuracy. |
| `prompt` | `string` | Optional text to guide the model's style or continue a previous segment. |
| `response_format` | enum (6) — `"json"`, `"text"`, `"srt"`, … | The format of the transcript output. Use `diarized_json` for OpenAI-compatible speaker segments on diarization-capable models. · default: `"json"` |
| `temperature` | `number` | Sampling temperature between 0 and 1. Lower is more deterministic. |
| `speakers_expected` | `integer` | Optional provider hint for the number of speakers. Only honored with `response_format=diarized_json`. · min: `1` |

<sub>`*` = required field</sub>

📤 **Response** · `200` · `application/json` — Success - Returns transcription

| Field | Type | Description |
|---|---|---|
| `text` | `string` | — |
| `segments` | `object`[] | OpenAI-compatible diarized segments. Present when `response_format=diarized_json`. |
| `segments[].type` | `"transcript.text.segment"` | — |
| `segments[].id` | `string` | — |
| `segments[].speaker` | `string` | — |
| `segments[].text` | `string` | — |
| `segments[].start` | `number` | — |
| `segments[].end` | `number` | — |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl -X POST "https://gen.pollinations.ai/v1/audio/transcriptions" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -F "file=@./audio.mp3" \
  -F "model=whisper-large-v3"
```

---

#### `GET` `/audio/{text}` — Generate Audio

Generate speech or music from text via a simple GET request.

**Text-to-speech (default):** Returns spoken audio in the selected voice and format.

**Available voices:** alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, matilda, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill

**Output formats:** mp3 (default), opus, aac, flac, wav, pcm

**Music generation:** Set `model=elevenmusic` to generate music instead of speech. Supports `duration` (3-300 seconds) and `instrumental` mode.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `text` * | `path` | `string` | Text to convert to speech, or a music description when model=elevenmusic |
| `voice` | `query` | `string` | Voice to use for speech generation (TTS only) · default: `"alloy"` |
| `response_format` | `query` | enum (6) — `"mp3"`, `"opus"`, `"aac"`, … | Audio output format (TTS only). Qwen TTS currently returns WAV regardless of this setting. · default: `"mp3"` |
| `model` | `query` | `string` | Audio model: TTS (default) or elevenmusic for music generation |
| `duration` | `query` | `string` | Music duration in seconds, 3-300 (elevenmusic only) |
| `instrumental` | `query` | `"true"` \| `"false"` | If true, guarantees instrumental output (elevenmusic only) · default: `"false"` |
| `style` | `query` | `string` | Style/genre tags for music generation (acestep only) |
| `instruct` | `query` | `string` | Emotion/style instruction (qwen-tts-instruct only) |
| `seed` | `query` | `integer` | Seed for deterministic output (0-4294967295). Same seed + params = best-effort return of the same cached result. Omit for random. · range: `-1…4294967295` |
| `key` | `query` | `string` | API key (alternative to Authorization header) |
| `safe` | `query` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `audio/mpeg` — Success - Returns audio data

💻 **Example**

```bash
curl "https://gen.pollinations.ai/audio/Hello%2C%20welcome%20to%20Pollinations!?voice=nova&response_format=mp3" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

### 🎙️ Realtime

#### `GET` `/v1/realtime` — Realtime WebSocket

OpenAI-compatible Realtime WebSocket proxy.

Connect with `wss://gen.pollinations.ai/v1/realtime?model=gpt-realtime-2` and send/receive Realtime JSON events over the socket.
Server clients can authenticate with `Authorization: Bearer <key>`. Browser WebSocket clients can use `?key=pk_...` because they cannot set custom authorization headers.

**Model:** `gpt-realtime-2`.

**Billing:** requires a positive balance. Gen proxies the WebSocket, aggregates observed `response.done` usage, and deducts one session total when the socket closes. Input transcription sessions are not supported yet.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `model` | `query` | `"gpt-realtime-2"` | Realtime model to use. Currently only gpt-realtime-2 is supported. · default: `"gpt-realtime-2"` |
| `key` | `query` | `string` | Pollinations API key. Useful for browser WebSocket clients that cannot set custom Authorization headers. |

<sub>`*` = required parameter</sub>

💻 **Example**

```bash
curl "https://gen.pollinations.ai/v1/realtime?model=gpt-realtime-2&key=:key" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

### 🔢 Embeddings

#### `GET` `/embeddings/models` — List Embedding Models

Returns available embedding models with pricing, capabilities, and supported input modalities. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.

📤 **Response** · `200` · `application/json` — Success

💻 **Example**

```bash
curl "https://gen.pollinations.ai/embeddings/models" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `POST` `/v1/embeddings` — Create Embeddings

Generate vector embeddings with an OpenAI-compatible response format.

**Models:** `gemini-2` supports text, image, audio, and video inputs. `openai-3-small` and `openai-3-large` are text-only models.

**Input:** Pass a string, an array of up to 32 strings, or Gemini multimodal content parts (`text`, `image_url`, `input_audio`, `video_url`) in the `input` field.

**Task types:** `task_type` is Gemini-only. For example, use `RETRIEVAL_QUERY` or `CLASSIFICATION` with `gemini-2`.

**Dimensions:** Defaults are model-specific. `qwen3-embedding-8b` supports up to 4096 dimensions; `gemini-2` and `openai-3-large` support up to 3072; `openai-3-small` supports up to 1536.

📥 **Request body** · `application/json`

| Field | Type | Description |
|---|---|---|
| `model` | `string` | Embedding model to use · default: `"openai-3-small"` |
| `input` * | `string` \| `string`[] \| `object` \| `object`[] | Input text or content parts to embed. Supports strings, arrays of strings (max 32 inputs), or multimodal content parts (text, image_url, input_audio, video_url). Multimodal content parts are supported by Gemini embedding models only. |
| `dimensions` | `integer` | Output embedding dimensions (128-4096). Model-specific limits apply; openai-3-small supports up to 1536. · range: `128…4096` |
| `task_type` | enum (8) — `"SEMANTIC_SIMILARITY"`, `"CLASSIFICATION"`, `"CLUSTERING"`, … | Gemini-specific task type hint for optimized embeddings |
| `encoding_format` | `"float"` \| `"base64"` | Output encoding for the embedding vector. `base64` packs Float32 little-endian like OpenAI. · default: `"float"` |

<sub>`*` = required field</sub>

📤 **Response** · `200` · `application/json` — Success

Returns [`CreateEmbeddingResponse`](#createembeddingresponse).

💻 **Example**

```bash
curl -X POST "https://gen.pollinations.ai/v1/embeddings" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":"Hello world"}'
```

### 🤖 Models

#### `GET` `/v1/models` — List Models (OpenAI-compatible)

Returns available models (text, image, realtime, audio, embeddings) in the OpenAI-compatible format (`{object: "list", data: [...]}`). Use this endpoint if you're using an OpenAI SDK. For richer metadata including pricing and capabilities, use `/models`, `/text/models`, `/image/models`, `/audio/models`, or `/embeddings/models` instead. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.

📤 **Response** · `200` · `application/json` — Success

| Field | Type | Description |
|---|---|---|
| `object` * | `"list"` | — |
| `data` * | `object`[] | — |
| `data[].id` * | `string` | — |
| `data[].object` * | `"model"` | — |
| `data[].created` * | `number` | — |
| `data[].input_modalities` | `string`[] | — |
| `data[].output_modalities` | `string`[] | — |
| `data[].supported_endpoints` | `string`[] | — |
| `data[].tools` | `boolean` | — |
| `data[].reasoning` | `boolean` | — |
| `data[].context_length` | `number` | — |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl "https://gen.pollinations.ai/v1/models" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/models` — List Models

Returns all available text, image, video, realtime, audio, and embedding models with pricing, capabilities, and metadata. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.

📤 **Response** · `200` · `application/json` — Success

💻 **Example**

```bash
curl "https://gen.pollinations.ai/models" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/image/models` — List Image & Video Models

Returns all available image and video generation models with pricing, capabilities, and metadata. Video models are included here — check the `outputModalities` field to distinguish image vs video models. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.

📤 **Response** · `200` · `application/json` — Success

💻 **Example**

```bash
curl "https://gen.pollinations.ai/image/models" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/text/models` — List Text Models (Detailed)

Returns all available text generation models with pricing, capabilities, and metadata including context window size, supported modalities, and tool support. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.

📤 **Response** · `200` · `application/json` — Success

💻 **Example**

```bash
curl "https://gen.pollinations.ai/text/models" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/audio/models` — List Audio Models

Returns all available audio models (text-to-speech, music generation, and transcription) with pricing, capabilities, and metadata. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.

📤 **Response** · `200` · `application/json` — Success

💻 **Example**

```bash
curl "https://gen.pollinations.ai/audio/models" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

### 📦 Media Storage

#### `POST` `/upload` — Upload media

Upload an image, audio, or video file. Supports multipart/form-data, raw binary, or base64 JSON. Returns a content-addressed hash URL. The hash includes the filename, so the same content with different filenames gets different URLs. Files are retained for 30 days; re-uploading resets the timer.

📤 **Response** · `200` · `application/json` — Upload successful

| Field | Type | Description |
|---|---|---|
| `id` * | `string` | — |
| `url` * | `string` | — |
| `contentType` * | `string` | — |
| `size` * | `integer` | — |
| `duplicate` * | `boolean` | — |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl -X POST "https://gen.pollinations.ai/upload" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -F "file=@./image.png"
```

---

#### `GET` `/{hash}` — Retrieve media

Get a file by its content hash. No authentication required. Responses are cached immutably.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `hash` * | `path` | `string` | — |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` — File content with appropriate Content-Type

💻 **Example**

```bash
curl "https://gen.pollinations.ai/a1b2c3d4e5f60718"
```

---

#### `HEAD` `/{hash}` — Check if media exists

Check existence and metadata without downloading the file.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `hash` * | `path` | `string` | — |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` — File exists (headers include Content-Type, Content-Length, X-Content-Hash)

💻 **Example**

```bash
curl -X HEAD "https://gen.pollinations.ai/a1b2c3d4e5f60718"
```

---

#### `GET` `/{hash}/metadata` — Get file metadata

Return file metadata (hash, content type, size, upload timestamp) as JSON without downloading the file body.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `hash` * | `path` | `string` | — |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `application/json` — File metadata

| Field | Type | Description |
|---|---|---|
| `hash` * | `string` | — |
| `contentType` * | `string` | — |
| `size` * | `integer` | — |
| `uploadedAt` | `string` | — |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl "https://gen.pollinations.ai/a1b2c3d4e5f60718/metadata"
```

### 👤 Account

Account endpoints use scoped account permissions. `account:usage` reads account state such as balances, usage, quests, and earnings. `account:keys` manages keys and, where enabled, my-models. These permissions are independent; request both when a client needs both. Newly created child keys cannot receive `account:keys` through this API.

#### `GET` `/account/profile` — Get Profile

Returns your account profile. GitHub username, profile image, current tier, next pollen refill timestamp, and community model access are always returned. Name and email are returned only when the API key has `account:profile`.

📤 **Response** · `200` · `application/json` — User profile

| Field | Type | Description |
|---|---|---|
| `githubUsername` * | `string` \| `null` | GitHub username if linked |
| `image` * | `string` \| `null` | Profile picture URL (e.g. GitHub avatar) |
| `tier` * | enum (7) — `"anonymous"`, `"microbe"`, `"spore"`, … | User's current tier level |
| `nextResetAt` * | `string · date-time` \| `null` | Next pollen refill timestamp (ISO 8601). `null` for tiers with no refill. |
| `communityEndpointsAllowed` * | `boolean` | Whether the account is allowed to manage community endpoints. |
| `name` | `string` \| `null` | User's display name (only returned when the key has `account:profile`) |
| `email` | `string · email` \| `null` | User's email address (only returned when the key has `account:profile`) |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl "https://gen.pollinations.ai/account/profile" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

```json
{
  "tier": "anonymous",
  "nextResetAt": "2026-01-01T00:00:00Z"
}
```

---

#### `GET` `/account/quests` — Get Quest Status

Returns the quest catalog with the authenticated account's read-only status. `completed` includes both globally completed quests and quests earned by the account. API keys require `account:usage`. Claiming rewards remains dashboard-only.

📤 **Response** · `200` · `application/json` — Quest status for the authenticated account

| Field | Type | Description |
|---|---|---|
| `quests` * | `object`[] | Array of quest records |
| `quests[].id` * | `string` | Quest id |
| `quests[].title` * | `string` | Quest title |
| `quests[].description` * | `string` | Quest description |
| `quests[].category` * | `string` | Quest category |
| `quests[].state` * | `"available"` \| `"completed"` \| `"coming_soon"` | Catalog state |
| `quests[].status` * | `"open"` \| `"completed"` \| `"coming_soon"` | Account status |
| `quests[].rewardAmount` * | `number` | Reward amount in pollen |
| `quests[].balanceBucket` * | `"tier"` \| `"pack"` | Reward balance bucket |
| `quests[].url` * | `string` \| `null` | Quest URL, when available |
| `quests[].reward` * | `object` \| `null` | Earned reward for this account, if any |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl "https://gen.pollinations.ai/account/quests" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/account/balance` — Get Balance

Returns the pollen balance visible to the caller. API keys with a budget always see their remaining budget (no scope needed). Full account balance requires `account:usage`.

📤 **Response** · `200` · `application/json` — Pollen balance

| Field | Type | Description |
|---|---|---|
| `balance` * | `number` | Remaining pollen balance (sum of tier balance + paid balance) |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl "https://gen.pollinations.ai/account/balance" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/account/usage` — Get Usage History

Returns your request history with per-request details: model used, token counts, cost, and response time. Defaults to the last 30 days, supports up to 90 days via `days`, or exact day/week/month periods via `granularity` and `period`. Supports JSON and CSV export. Each response is capped at 50,000 rows. Use `before` with `before_event_id` for stable cursor-based pagination. API keys require `account:usage`.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `format` | `query` | `"json"` \| `"csv"` | default: `"json"` |
| `limit` | `query` | `number` | default: `100` · range: `1…50000` |
| `before` | `query` | `string` | — |
| `before_event_id` | `query` | `string` | — |
| `days` | `query` | `integer` | default: `30` · range: `1…90` |
| `granularity` | `query` | `"day"` \| `"week"` \| `"month"` | — |
| `period` | `query` | `string` | — |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `application/json` — Usage records

| Field | Type | Description |
|---|---|---|
| `usage` * | `object`[] | Array of usage records |
| `usage[].timestamp` * | `string` | Request timestamp (YYYY-MM-DD HH:mm:ss format) |
| `usage[].cursor_event_id` * | `string` | Event id used with `before_event_id` for stable pagination |
| `usage[].type` * | `string` | Request type (e.g., 'generate.image', 'generate.text') |
| `usage[].model` * | `string` \| `null` | Model used for generation |
| `usage[].api_key_id` * | `string` \| `null` | API key id used for generation |
| `usage[].api_key` * | `string` \| `null` | API key display name |
| `usage[].api_key_type` * | `string` \| `null` | Type of API key ('secret', 'publishable') |
| `usage[].meter_source` * | `string` \| `null` | Billing source: 'tier' = tier balance, 'pack' = paid balance |
| `usage[].input_text_tokens` * | `number` | Number of input text tokens |
| `usage[].input_cached_tokens` * | `number` | Number of cached input tokens |
| `usage[].input_audio_tokens` * | `number` | Number of input audio tokens |
| `usage[].input_audio_seconds` * | `number` | Duration of input audio in seconds (for transcription/STT) |
| `usage[].input_image_tokens` * | `number` | Number of input image tokens |
| `usage[].output_text_tokens` * | `number` | Number of output text tokens |
| `usage[].output_reasoning_tokens` * | `number` | Number of reasoning tokens (for models with chain-of-thought) |
| `usage[].output_audio_tokens` * | `number` | Number of output audio tokens |
| `usage[].output_audio_seconds` * | `number` | Duration of output audio in seconds (for TTS/music generation) |
| `usage[].output_image_tokens` * | `number` | Number of output image tokens (1 per image) |
| `usage[].output_video_seconds` * | `number` | Duration of output video in seconds |
| `usage[].cost_usd` * | `number` | Cost in USD for this request |
| `usage[].response_time_ms` * | `number` \| `null` | Response time in milliseconds |
| `count` * | `number` | Number of records returned |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl "https://gen.pollinations.ai/account/usage?format=json&limit=100" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/account/usage/daily` — Get Daily Usage

Returns daily aggregated usage for the requested time window, grouped by date and model. Use `days` for rolling windows or `granularity` and `period` for exact day/week/month periods. Useful for dashboards and spending analysis. Supports JSON and CSV export. Results are cached for 1 hour. API keys require `account:usage`.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `format` | `query` | `"json"` \| `"csv"` | default: `"json"` |
| `days` | `query` | `integer` | default: `90` · range: `1…90` |
| `granularity` | `query` | `"day"` \| `"week"` \| `"month"` | — |
| `period` | `query` | `string` | — |
| `api_key_ids` | `query` | `string` | — |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `application/json` — Daily usage records aggregated by date/model

| Field | Type | Description |
|---|---|---|
| `usage` * | `object`[] | Array of daily usage records |
| `usage[].date` * | `string` | Date (YYYY-MM-DD format) |
| `usage[].model` * | `string` \| `null` | Model used |
| `usage[].meter_source` * | `string` \| `null` | Billing source: 'tier' = tier balance, 'pack' = paid balance |
| `usage[].requests` * | `number` | Number of requests |
| `usage[].cost_usd` * | `number` | Total cost in USD |
| `count` * | `number` | Number of records returned |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl "https://gen.pollinations.ai/account/usage/daily?format=json&days=90" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/account/earnings` — Get Developer Earnings

Returns developer earnings in one response: per-(date, entity) buckets, per-entity rollups, per-source rollups, and additive money totals across BYOP apps and community models. Source-specific rows include `requests`, `baseline_price`, reward basis `cost_usd`, `reward_rate`, and `unique_users`; the top-level total only includes additive earned-pollen fields. Use `days` for rolling windows or `granularity` and `period` for exact day/week/month periods. Cached for 1 hour. API keys require `account:usage`.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `format` | `query` | `"json"` \| `"csv"` | default: `"json"` |
| `days` | `query` | `integer` | default: `90` · range: `1…90` |
| `granularity` | `query` | `"day"` \| `"week"` \| `"month"` | — |
| `period` | `query` | `string` | — |
| `api_key_ids` | `query` | `string` | — |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `application/json` — Combined earnings buckets and rollups

| Field | Type | Description |
|---|---|---|
| `daily` * | `object`[] | Per-(date, app) buckets for the period |
| `daily[].date` * | `string` | Date bucket (YYYY-MM-DD or hourly); empty string on rollup rows |
| `daily[].app_key_id` * | `string` | BYOP app key id; empty string on the global rollup row |
| `daily[].app_name` * | `string` | App display name |
| `daily[].requests` * | `number` | Number of billed requests |
| `daily[].baseline_price` * | `number` | Model cost before markup (sum over the bucket) |
| `daily[].pollen_earned` * | `number` | Developer credit — markup take (cost_usd − baseline_price) |
| `daily[].cost_usd` * | `number` | Markup-inclusive total charged to payers (sum over the bucket) |
| `daily[].markup_rate` * | `number` | Average markup rate applied |
| `daily[].unique_users` * | `number` | Distinct end-users who paid. Always 0 on daily/hourly bucket rows by design — meaningful only on rollup rows (where date=''). |
| `perApp` * | `object`[] | Per-app rollups for the period |
| `perApp[].date` * | `string` | Date bucket (YYYY-MM-DD or hourly); empty string on rollup rows |
| `perApp[].app_key_id` * | `string` | BYOP app key id; empty string on the global rollup row |
| `perApp[].app_name` * | `string` | App display name |
| `perApp[].requests` * | `number` | Number of billed requests |
| `perApp[].baseline_price` * | `number` | Model cost before markup (sum over the bucket) |
| `perApp[].pollen_earned` * | `number` | Developer credit — markup take (cost_usd − baseline_price) |
| `perApp[].cost_usd` * | `number` | Markup-inclusive total charged to payers (sum over the bucket) |
| `perApp[].markup_rate` * | `number` | Average markup rate applied |
| `perApp[].unique_users` * | `number` | Distinct end-users who paid. Always 0 on daily/hourly bucket rows by design — meaningful only on rollup rows (where date=''). |
| `global` * | `object` \| `null` | Global rollup across all apps for the period |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl "https://gen.pollinations.ai/account/earnings?format=json&days=90" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/account/keys` — List API Keys

List all API keys for the current user. Requires `account:keys` permission when using API keys. Secret key values are never returned.

📤 **Response** · `200` — List of API keys

💻 **Example**

```bash
curl "https://gen.pollinations.ai/account/keys" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `POST` `/account/keys` — Create API Key

Create a new API key. To create an app key, use `type: "publishable"` with `redirectUris`. Publishable app keys default developer earnings off; send `earningsEnabled: true` to opt in. Requires `account:keys` permission when using API keys. The full key value is returned only once in the response. The `keys` account permission is automatically stripped from child keys to prevent escalation.

📥 **Request body** · `application/json`

| Field | Type | Description |
|---|---|---|
| `name` * | `string` | Name for the API key · length: `1…253` |
| `type` | `"secret"` \| `"publishable"` | Key type: secret (sk_) or publishable app key (pk_). Use publishable to create an app key. · default: `"secret"` |
| `expiresIn` | `integer` | Expiry in seconds from now (max 365 days) · max: `31536000` |
| `allowedModels` | `string`[] \| `null` | Model IDs this key can access. null = all models |
| `pollenBudget` | `number` \| `null` | Pollen budget cap. null = unlimited |
| `accountPermissions` | `string`[] \| `null` | Account permissions (e.g. ["usage"]). "keys" is auto-stripped. |
| `redirectUris` | `string`[] | Allowed OAuth redirect URIs for publishable app keys. Required for OAuth app flows. Must be https:// except http:// loopback URIs for local apps. Matching pins scheme, host, port, and path; one trailing slash is ignored. If the registered URI has no query, incoming query params are allowed; if it has a query, the query must match exactly. Loopback ports are matched port-agnostically. |
| `earningsEnabled` | `boolean` | Enable developer earnings for publishable app keys. Defaults to false; send true to opt in. |

<sub>`*` = required field</sub>

📤 **Response** · `200` — Created API key with full secret

💻 **Example**

```bash
curl -X POST "https://gen.pollinations.ai/account/keys" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-app-backend","type":"secret","allowedModels":["openai","flux"],"pollenBudget":100}'
```

---

#### `DELETE` `/account/keys/{id}` — Revoke API Key

Delete/revoke an API key. Requires `account:keys` permission when using API keys. Cannot revoke the key used to authenticate the request.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `id` * | `path` | `string` | — |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` — Key revoked

💻 **Example**

```bash
curl -X DELETE "https://gen.pollinations.ai/account/keys/key_abc123" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/account/key` — Get API Key Info

Returns information about the API key used in the request: validity, type (secret/publishable), expiry, permissions, and remaining budget. Useful for validating keys without making generation requests.

📤 **Response** · `200` · `application/json` — API key status and information

| Field | Type | Description |
|---|---|---|
| `valid` * | `boolean` | Whether the API key is valid and active |
| `type` * | `"publishable"` \| `"secret"` | Type of API key |
| `name` * | `string` \| `null` | Display name of the API key |
| `expiresAt` * | `string` \| `null` | Expiry timestamp in ISO 8601 format, null if never expires |
| `expiresIn` * | `number` \| `null` | Seconds until expiry, null if never expires |
| `permissions` * | `object` | API key permissions |
| `permissions.models` * | `string`[] \| `null` | List of allowed model IDs, null = all models allowed |
| `permissions.account` * | `string`[] \| `null` | List of account permissions, null = no account access |
| `pollenBudget` * | `number` \| `null` | Remaining pollen budget for this key, null = unlimited (uses user balance) |
| `rateLimitEnabled` * | `boolean` | Whether rate limiting is enabled for this key |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl "https://gen.pollinations.ai/account/key" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/account/key/usage` — Get API Key Usage

Returns usage history for the API key used in the request. No scope required — a key can always read its own usage. Use `before` with `before_event_id` for stable cursor-based pagination. For account-wide usage across all keys, use `/account/usage` with `account:usage`.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `format` | `query` | `"json"` \| `"csv"` | default: `"json"` |
| `limit` | `query` | `number` | default: `100` · range: `1…50000` |
| `before` | `query` | `string` | — |
| `before_event_id` | `query` | `string` | — |
| `days` | `query` | `integer` | default: `30` · range: `1…90` |
| `granularity` | `query` | `"day"` \| `"week"` \| `"month"` | — |
| `period` | `query` | `string` | — |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `application/json` — Usage records for this key

| Field | Type | Description |
|---|---|---|
| `usage` * | `object`[] | Array of usage records |
| `usage[].timestamp` * | `string` | Request timestamp (YYYY-MM-DD HH:mm:ss format) |
| `usage[].cursor_event_id` * | `string` | Event id used with `before_event_id` for stable pagination |
| `usage[].type` * | `string` | Request type (e.g., 'generate.image', 'generate.text') |
| `usage[].model` * | `string` \| `null` | Model used for generation |
| `usage[].api_key_id` * | `string` \| `null` | API key id used for generation |
| `usage[].api_key` * | `string` \| `null` | API key display name |
| `usage[].api_key_type` * | `string` \| `null` | Type of API key ('secret', 'publishable') |
| `usage[].meter_source` * | `string` \| `null` | Billing source: 'tier' = tier balance, 'pack' = paid balance |
| `usage[].input_text_tokens` * | `number` | Number of input text tokens |
| `usage[].input_cached_tokens` * | `number` | Number of cached input tokens |
| `usage[].input_audio_tokens` * | `number` | Number of input audio tokens |
| `usage[].input_audio_seconds` * | `number` | Duration of input audio in seconds (for transcription/STT) |
| `usage[].input_image_tokens` * | `number` | Number of input image tokens |
| `usage[].output_text_tokens` * | `number` | Number of output text tokens |
| `usage[].output_reasoning_tokens` * | `number` | Number of reasoning tokens (for models with chain-of-thought) |
| `usage[].output_audio_tokens` * | `number` | Number of output audio tokens |
| `usage[].output_audio_seconds` * | `number` | Duration of output audio in seconds (for TTS/music generation) |
| `usage[].output_image_tokens` * | `number` | Number of output image tokens (1 per image) |
| `usage[].output_video_seconds` * | `number` | Duration of output video in seconds |
| `usage[].cost_usd` * | `number` | Cost in USD for this request |
| `usage[].response_time_ms` * | `number` \| `null` | Response time in milliseconds |
| `count` * | `number` | Number of records returned |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl "https://gen.pollinations.ai/account/key/usage?format=json&limit=100" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `/account/my-models` — Manage My Models

Invite-only community text model administration for accounts with `communityEndpointsAllowed: true`. API keys require `account:keys`; dashboard sessions can manage models directly when enabled. Responses never include the stored upstream bearer token.

| Endpoint | Description |
|---|---|
| `GET /account/my-models` | List registered models |
| `POST /account/my-models` | Create a model |
| `POST /account/my-models/{id}/update` | Update a model |
| `DELETE /account/my-models/{id}` | Delete a model |
| `POST /account/my-models/models` | Inspect upstream model IDs |
| `POST /account/my-models/test` | Test an upstream model |

💻 **Example**

```bash
curl "https://gen.pollinations.ai/account/my-models" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

## ⚠️ Error Responses

All endpoints return errors in this envelope:

```json
{
  "status": 400,
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Description of what went wrong",
    "timestamp": "2026-01-01T00:00:00.000Z",
    "details": { "name": "ValidationError" },
    "requestId": "req_abc123"
  }
}
```

| Status | Code | Description |
|---|---|---|
| `400` | `BAD_REQUEST` | Invalid input. `details` includes `formErrors` and `fieldErrors` for validation failures. |
| `401` | `UNAUTHORIZED` | Missing or invalid API key. Provide via `Authorization: Bearer <key>` header or `?key=<key>` query param. |
| `402` | `PAYMENT_REQUIRED` | Insufficient pollen balance or API key budget exhausted. |
| `403` | `FORBIDDEN` | Access denied — insufficient permissions or tier for this model. |
| `404` | `NOT_FOUND` | Resource not found. |
| `405` | `METHOD_NOT_ALLOWED` | HTTP method not supported on this route. |
| `409` | `CONFLICT` | Request conflicts with current resource state (e.g. duplicate key name). |
| `422` | `UNPROCESSABLE_ENTITY` | Request was well-formed but semantically invalid — typically a model rejection or unsupported parameter combination. |
| `422` | `content_policy_violation` | Prompt, input, or generated content was blocked by content moderation. Adjust the input and retry. |
| `429` | `RATE_LIMITED` | Too many requests. Slow down. |
| `500` | `INTERNAL_ERROR` | Server error. We're on it. |
| `502` | `BAD_GATEWAY` | Upstream provider returned an unexpected error (auth, billing). |
| `503` | `SERVICE_UNAVAILABLE` | Temporarily unavailable — usually the safety/balance check service is degraded. Retry with backoff. |

## 🧩 Schemas

Reusable request/response objects referenced from the endpoints above.

### `CacheControl`

Marks the end of a static prompt prefix to cache (Gemini models). Place on the final content block of the prefix; repeat requests bill the cached prefix at ~10% of the input rate. See the **Prompt caching** section under Chat Completions.

| Field | Type | Description |
|---|---|---|
| `type` * | `"ephemeral"` | — |

<sub>`*` = required field</sub>

### `CompletionUsage`

| Field | Type | Description |
|---|---|---|
| `cache_creation_input_tokens` | `integer` \| `null` | — |
| `cache_read_input_tokens` | `integer` \| `null` | — |
| `completion_tokens` * | `integer` | — |
| `completion_tokens_details` | `object` \| `null` | — |
| `prompt_tokens` * | `integer` | — |
| `prompt_tokens_details` | `object` \| `null` | — |
| `total_tokens` * | `integer` | — |

<sub>`*` = required field</sub>

### `ContentFilterResult`

| Field | Type | Description |
|---|---|---|
| `hate` | `object` | — |
| `hate.filtered` * | `boolean` | — |
| `hate.severity` * | [`ContentFilterSeverity`](#contentfilterseverity) | — |
| `self_harm` | `object` | — |
| `self_harm.filtered` * | `boolean` | — |
| `self_harm.severity` * | [`ContentFilterSeverity`](#contentfilterseverity) | — |
| `sexual` | `object` | — |
| `sexual.filtered` * | `boolean` | — |
| `sexual.severity` * | [`ContentFilterSeverity`](#contentfilterseverity) | — |
| `violence` | `object` | — |
| `violence.filtered` * | `boolean` | — |
| `violence.severity` * | [`ContentFilterSeverity`](#contentfilterseverity) | — |
| `jailbreak` | `object` | — |
| `jailbreak.filtered` * | `boolean` | — |
| `jailbreak.detected` * | `boolean` | — |
| `protected_material_text` | `object` | — |
| `protected_material_text.filtered` * | `boolean` | — |
| `protected_material_text.detected` * | `boolean` | — |
| `protected_material_code` | `object` | — |
| `protected_material_code.filtered` * | `boolean` | — |
| `protected_material_code.detected` * | `boolean` | — |

<sub>`*` = required field</sub>

### `ContentFilterSeverity`

**Type:** `"safe"` \| `"low"` \| `"medium"` \| `"high"`

### `CreateEmbeddingRequest`

| Field | Type | Description |
|---|---|---|
| `model` | `string` | Embedding model to use · default: `"openai-3-small"` |
| `input` * | `string` \| `string`[] \| `object` \| `object`[] | Input text or content parts to embed. Supports strings, arrays of strings (max 32 inputs), or multimodal content parts (text, image_url, input_audio, video_url). Multimodal content parts are supported by Gemini embedding models only. |
| `dimensions` | `integer` | Output embedding dimensions (128-4096). Model-specific limits apply; openai-3-small supports up to 1536. · range: `128…4096` |
| `task_type` | enum (8) — `"SEMANTIC_SIMILARITY"`, `"CLASSIFICATION"`, `"CLUSTERING"`, … | Gemini-specific task type hint for optimized embeddings |
| `encoding_format` | `"float"` \| `"base64"` | Output encoding for the embedding vector. `base64` packs Float32 little-endian like OpenAI. · default: `"float"` |

<sub>`*` = required field</sub>

### `CreateEmbeddingResponse`

| Field | Type | Description |
|---|---|---|
| `object` * | `"list"` | — |
| `data` * | `object`[] | — |
| `data[].object` * | `"embedding"` | — |
| `data[].embedding` * | `number`[] \| `string` | Embedding vector — array of floats, or base64-encoded Float32 (little-endian) when `encoding_format=base64`. |
| `data[].index` * | `integer` | Index of the embedding in the list |
| `model` * | `string` | — |
| `usage` * | `object` | — |
| `usage.prompt_tokens` * | `integer` | — |
| `usage.total_tokens` * | `integer` | — |

<sub>`*` = required field</sub>

### `CreateImageRequest`

| Field | Type | Description |
|---|---|---|
| `prompt` * | `string` | A text description of the desired image(s) · length: `1…32000` |
| `model` | `string` | The model to use for image generation · default: `"flux"` |
| `n` | `integer` | Number of images to generate (currently max 1) · default: `1` · range: `1…1` |
| `size` | `string` | Image size as WIDTHxHEIGHT (e.g., 1024x1024, 512x512) · default: `"1024x1024"` |
| `quality` | `"standard"` \| `"hd"` \| `"low"` \| `"medium"` \| `"high"` | Image quality. OpenAI 'standard'/'hd' mapped to Pollinations equivalents · default: `"medium"` |
| `response_format` | `"url"` \| `"b64_json"` | Return format. "url" returns a pollinations.ai URL, "b64_json" returns base64-encoded image data · default: `"b64_json"` |
| `user` | `string` | End-user identifier for abuse tracking |
| `image` | `string` \| `string`[] | Reference image URL(s) for image-to-image generation (Pollinations extension) |
| `safe` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |

<sub>`*` = required field</sub>

### `CreateImageResponse`

| Field | Type | Description |
|---|---|---|
| `created` * | `integer` | — |
| `data` * | `object`[] | — |
| `data[].url` | `string` | — |
| `data[].b64_json` | `string` | — |
| `data[].revised_prompt` | `string` | — |

<sub>`*` = required field</sub>

### `CreateSpeechRequest`

| Field | Type | Description |
|---|---|---|
| `model` | `string` | — |
| `input` * | `string` | The text to generate audio for. Maximum 4096 characters. · length: `1…4096` |
| `safe` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |
| `voice` | `string` | The voice to use. Can be any preset name (alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, matilda, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill) OR a custom ElevenLabs voice ID (UUID from your dashboard). · default: `"alloy"` |
| `response_format` | enum (6) — `"mp3"`, `"opus"`, `"aac"`, … | The audio format for the output. Qwen TTS currently returns WAV regardless of this setting. · default: `"mp3"` |
| `duration` | `number` | Music duration in seconds, 3-300 (elevenmusic/acestep) · range: `3…300` |
| `instrumental` | `boolean` | If true, guarantees instrumental output (elevenmusic only) |
| `seed` | `integer` | Seed for deterministic output. Same seed + params = best-effort return of the same cached result. Omit for random. · max: `4294967295` |
| `style` | `string` | Style/genre tags for music generation (acestep only). If omitted, style is auto-detected from the input text. |
| `instruct` | `string` | Emotion/style instruction (qwen-tts-instruct only). e.g. 'excited and cheerful'. |

<sub>`*` = required field</sub>

### `ErrorDetails`

| Field | Type | Description |
|---|---|---|
| `name` * | `string` | — |
| `upstreamStatus` | `integer` | — |
| `upstreamHost` | `string` | — |
| `upstreamBody` | `string` | — |

<sub>`*` = required field</sub>

### `MessageContentPart`

**Union type.** One of:

- `type: "text"` — fields: `text`, `cache_control`
- `type: "image_url"` — fields: `image_url`
- `type: "video_url"` — fields: `video_url`
- `type: "input_audio"` — fields: `input_audio`, `cache_control`
- `type: "file"` — fields: `file`, `cache_control`
- `object`

### `ValidationErrorDetails`

| Field | Type | Description |
|---|---|---|
| `name` * | `string` | — |
| `formErrors` * | `string`[] | — |
| `fieldErrors` * | `object` | — |

<sub>`*` = required field</sub>
