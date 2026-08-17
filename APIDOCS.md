<picture>
  <source media="(prefers-color-scheme: dark)" srcset="packages/ui/src/brand/lockup-horizontal-white.svg">
  <img alt="Pollinations" src="packages/ui/src/brand/lockup-horizontal-black.svg" width="420">
</picture>

> Generate text, images, video, audio, realtime voice, and embeddings with a single API. OpenAI-compatible — use any OpenAI SDK by changing the base URL.

# API docs

Also available at [https://gen.pollinations.ai/docs](https://gen.pollinations.ai/docs)

**Version:** `0.3.0` · **OpenAPI:** `3.1.0` · **Base URL:** `https://gen.pollinations.ai`

## 🚀 Getting Started

**1. Get an API key** at [enter.pollinations.ai](https://enter.pollinations.ai/keys). Two key types are available:

- `sk_*` — secret key for backend use (full account access)
- `pk_*` — publishable key, safe to ship in browsers and mobile apps

**2. Send the key** in the `Authorization` header (or as `?key=` query param for GET endpoints):

```bash
curl https://gen.pollinations.ai/v1/models \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

**3. Pick an endpoint** from the [📑 Contents](#-contents) below.

**Integration guides:** [BYOP](https://gen.pollinations.ai/docs#tag/byop) · [CLI](https://gen.pollinations.ai/docs#tag/cli) · [MCP Server](https://gen.pollinations.ai/docs#tag/mcp-server)

## 📑 Contents

- [🚀 Getting Started](#-getting-started)
- [🔐 Authentication](#-authentication)
- [🔓 Sign in with Pollinations (OAuth 2.1)](#-sign-in-with-pollinations-oauth-21)
- [🧪 Use any OpenAI SDK](#-use-any-openai-sdk)
- [🌊 Streaming chat completions](#-streaming-chat-completions)
- [🖼️ Vision: passing images into chat](#-vision-passing-images-into-chat)
- [📤 Multipart uploads in depth](#-multipart-uploads-in-depth)
- [💡 Tips](#-tips)
- [🛠️ Endpoints](#-endpoints)
  - [Text](#text)
  - [Image](#image)
  - [Video](#video)
  - [Audio](#audio)
  - [Realtime](#realtime)
  - [Embeddings](#embeddings)
  - [Models](#models)
  - [Media Storage](#media-storage)
  - [📊 Monitor](#-monitor)
  - [3D](#3d)
- [⚠️ Error Responses](#-error-responses)
- [🧩 Schemas](#-schemas)

## 🔐 Authentication

Pollinations recognises two key types. Use the right one for the surface you're building.

| Key type | Prefix | Where it goes | What it can do |
|---|---|---|---|
| Secret key | `sk_` | Server-only (env var, secrets manager) | Full account access. Can create child keys, list usage, run any model the account allows. **Never ship to a browser, mobile app, or repo.** |
| Publishable key | `pk_` | Browsers, mobile apps, public clients | Calls models on behalf of the developer who created the key. Restricted to the permissions and budget set at creation. Safe to embed. |

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
| `GET /{id}`, `GET /{id}/metadata`, `HEAD /{id}` | None — media URLs are public reads |
| `GET /models`, `GET /v1/models`, `GET /image/models`, `GET /text/models`, `GET /audio/models`, `GET /embeddings/models` | None — model catalogue is public. Sending a bearer key returns the same data; some endpoints add per-account fields when authenticated. |
| Everything else | Bearer key required unless the endpoint documents `?key=` support |

`401 UNAUTHORIZED` always means key missing or invalid. `402 PAYMENT_REQUIRED` means the key authenticated but the account or per-key budget is exhausted — see [Error Responses](#-error-responses).

## 🔓 Sign in with Pollinations (OAuth 2.1)

Third-party apps can obtain an API key on behalf of a Pollinations user — the OAuth 2.1 authorization-code flow with PKCE (S256) for web apps, or the device flow (RFC 8628) for CLIs. Register a **publishable App Key** (`pk_…`) with your redirect URIs at [enter.pollinations.ai](https://enter.pollinations.ai/keys); the `pk_` key is your `client_id` (public client, no secret), and the issued access token is an opaque `sk_` key bound to the budget, expiry, and scopes the user approved.

Endpoints are discoverable via RFC 8414 metadata — resolve them from there rather than hardcoding:

```
GET https://enter.pollinations.ai/.well-known/oauth-authorization-server
```

The full integration guide — authorization request, token exchange, device flow, userinfo, scopes, revocation — is [Bring Your Own Pollen (BYOP)](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md).

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

**Upload arbitrary media** to the media store (a separate host: `media.pollinations.ai`). Returns a `https://media.pollinations.ai/<id>` URL you can pass anywhere a remote image, audio, or video URL is accepted.

```bash
curl -X POST "https://media.pollinations.ai/upload" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -F "file=@./asset.png"
```

Each upload gets its own unique id — re-uploading the same bytes yields a new URL. Files use a 30-day lifecycle from upload or the latest refresh. Retrieving the file body refreshes that lifecycle only when the object is at least 15 days old; metadata and HEAD requests do not refresh it. An optional `-F "tags=..."` field publishes the upload to those tags' public galleries (`GET https://media.pollinations.ai/media?tag=...`); untagged uploads stay unlisted.

## 💡 Tips

- **Use `pk_` keys in browsers.** Anywhere a `sk_` key could be read off the wire, use a publishable key with a tight budget and an allow-list of models.
- **One key per app.** Child keys scope budget and permissions independently — easier to audit, easier to revoke without touching production.
- **Retry the same request after a timeout.** Keep the endpoint, body, query parameters, and seed unchanged. Your retry waits for the generation already in progress or receives the completed cached result instead of starting another generation.
- **Watch `429` and `503`.** A `Retry-After` header tells you how long to back off. `502` from us means upstream provider — usually transient.

## 🛠️ Endpoints

### Text

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
| `reasoning_effort` | enum (7) — `"none"`, `"minimal"`, `"low"`, … | Requests reasoning depth for models that support adjustable reasoning. "none" requests no reasoning. |
| `web_search_options` | `object` | Controls Perplexity Sonar search context. Pollinations currently supports low and high. |
| `web_search_options.search_context_size` * | `"low"` \| `"medium"` \| `"high"` | — |
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
| `model` | `string` | — |
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

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "openai",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 12,
    "total_tokens": 22
  }
}
```

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
| `reasoning_effort` | enum (7) — `"none"`, `"minimal"`, `"low"`, … | Requests reasoning depth for models that support adjustable reasoning. "none" requests no reasoning. |
| `web_search_options` | `object` | Controls Perplexity Sonar search context. Pollinations currently supports low and high. |
| `web_search_options.search_context_size` * | `"low"` \| `"medium"` \| `"high"` | — |
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
| `seed` | `query` | `integer` | Seed for reproducible results. · default: `0` · min: `-1` |
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

### Image

#### `GET` `/image/{prompt}` — Generate Image

Generate an image from a text prompt. Returns JPEG, PNG, or SVG depending on the selected model.

**Available models:** `krea`, `dreamshaper`, `kontext`, `nanobanana`, `nanobanana-2`, `nanobanana-2-lite`, `nanobanana-pro`, `seedream5`, `seedream5-pro`, `seedream`, `seedream-pro`, `ideogram-v4-turbo`, `ideogram-v4-balanced`, `ideogram-v4-quality`, `gptimage`, `gptimage-large`, `gpt-image-2`, `flux`, `zimage`, `zimage-fal`, `wan-image`, `wan-image-pro`, `qwen-image`, `qwen-image-3`, `grok-imagine`, `grok-imagine-pro`, `grok-imagine-image-2.0`, `recraft-v4.1-vector`, `klein`, `p-image`, `p-image-edit`, `nova-canvas`. `zimage` is the default.

Browse all available models and their capabilities at [`/image/models`](https://gen.pollinations.ai/image/models).

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `prompt` * | `path` | `string` | Text description of the image to generate |
| `model` * | `query` | `string` | Model to use. **Image:** flux, zimage, gptimage, kontext, seedream5, seedream5-pro, nanobanana, nanobanana-pro, klein. **Video:** veo, seedance-pro, wan, wan-pro, p-video, nova-reel. See /image/models for full list. · default: `"zimage"` |
| `width` | `query` | `integer` | Width in pixels. For images, exact pixels. For video models, used for aspect ratio; use `resolution` to select a resolution tier. · default: `1024` |
| `height` | `query` | `integer` | Height in pixels. For images, exact pixels. For video models, used for aspect ratio; use `resolution` to select a resolution tier. · default: `1024` |
| `seed` | `query` | `integer` | Seed for reproducible results. Supported by: flux, zimage, seedream, klein, seedance, nova-reel. Other models ignore this parameter. · default: `0` · range: `-1…2147483647` |
| `safe` | `query` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |
| `quality` | `query` | `"low"` \| `"medium"` \| `"high"` \| `"hd"` | Image quality level. Supported by `gptimage`, `gptimage-large`, `gpt-image-2`, and `grok-imagine-image-2.0`. · default: `"medium"` |
| `image` | `query` | `string` | Reference image URL(s) for image editing or video generation. Separate multiple URLs with `\|` or `,`. **Image models:** Used for editing/style reference (kontext, gptimage, seedream, klein, nanobanana). **Video models:** `image[0]` = starting frame (I2V); `image[1]` = ending frame for first+last-frame interpolation. End-frame supported by `veo`, the `seedance-2.0` family, `seedance-2.5`, `wan-fast`, and `wan-pro`; other video models silently drop `image[1]`. See `video_capabilities` on `/image/models` or `/models` for per-model support. |
| `transparent` | `query` | `boolean` | Generate image with transparent background. Only supported by `gptimage` and `gptimage-large`. · default: `false` |
| `resolution` | `query` | enum (6) — `"1k"`, `"2k"`, `"480p"`, … | Output resolution for image and video models that advertise `resolutions` in `/models`. The first advertised resolution is the default; requested tiers bill at their listed rate. |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `image/jpeg`, `image/png`, `image/svg+xml` — Success - Returns the generated image

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
| `resolution` | enum (6) — `"1k"`, `"2k"`, `"480p"`, … | Output resolution for resolution-priced image and video models (Pollinations extension) |
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
Community image models forward edits to the registrant's OpenAI-compatible endpoint as multipart form data.

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

### Video

#### `GET` `/video/{prompt}` — Generate Video

Generate a video from a text prompt. Returns MP4.

**Available models:** `veo`, `seedance-pro`, `seedance-2.0`, `seedance-2.0-mini`, `seedance-2.0-fast`, `wan`, `wan-fast`, `wan-pro`, `grok-video-pro`, `grok-imagine-video-1.5`, `seedance-2.5`, `happyhorse-1.1`, `minimax-h3`, `p-video`, `nova-reel`.

Use `duration` to set video length, `aspectRatio` for orientation, and `audio` where the selected model supports audio output.

You can pass reference images via the `image` parameter: `image[0]` is the start frame, and `image[1]` is the end frame for models with `end_frame` in `video_capabilities`.

Browse all available models and their `video_capabilities` at [`/image/models`](https://gen.pollinations.ai/image/models).

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `prompt` * | `path` | `string` | Text description of the video to generate |
| `model` * | `query` | `string` | Model to use. **Image:** flux, zimage, gptimage, kontext, seedream5, seedream5-pro, nanobanana, nanobanana-pro, klein. **Video:** veo, seedance-pro, wan, wan-pro, p-video, nova-reel. See /image/models for full list. · default: `"veo"` |
| `width` | `query` | `integer` | Width in pixels. For images, exact pixels. For video models, used for aspect ratio; use `resolution` to select a resolution tier. · default: `1024` |
| `height` | `query` | `integer` | Height in pixels. For images, exact pixels. For video models, used for aspect ratio; use `resolution` to select a resolution tier. · default: `1024` |
| `seed` | `query` | `integer` | Seed for reproducible results. Supported by: flux, zimage, seedream, klein, seedance, nova-reel. Other models ignore this parameter. · default: `0` · range: `-1…2147483647` |
| `safe` | `query` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |
| `image` | `query` | `string` | Reference image URL(s) for image editing or video generation. Separate multiple URLs with `\|` or `,`. **Image models:** Used for editing/style reference (kontext, gptimage, seedream, klein, nanobanana). **Video models:** `image[0]` = starting frame (I2V); `image[1]` = ending frame for first+last-frame interpolation. End-frame supported by `veo`, the `seedance-2.0` family, `seedance-2.5`, `wan-fast`, and `wan-pro`; other video models silently drop `image[1]`. See `video_capabilities` on `/image/models` or `/models` for per-model support. |
| `resolution` | `query` | enum (6) — `"1k"`, `"2k"`, `"480p"`, … | Output resolution for image and video models that advertise `resolutions` in `/models`. The first advertised resolution is the default; requested tiers bill at their listed rate. |
| `duration` | `query` | `integer` | Video duration in seconds. Only applies to video models. `veo`: 4, 6, or 8s. `seedance-pro`: 2-10s. `seedance-2.0`: 4-15s; Mini: 4-10s; Fast: 4-5s. `seedance-2.5`: exactly 4s. `minimax-h3`: exactly 5s. `wan`: 2-15s. `nova-reel`: 6-120s (multiples of 6). · range: `1…120` |
| `aspectRatio` | `query` | `string` | Video aspect ratio (`16:9` or `9:16`). Only applies to video models. If not set, determined by explicit width/height; `seedance-2.5` otherwise defaults to `16:9`. `minimax-h3` supports only `16:9`. |
| `audio` | `query` | `boolean` | Generate audio for the video. Only applies to video models. `wan` and `minimax-h3` always generate audio regardless of this flag. For `veo`, set to `true` to enable audio. · default: `false` |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `video/mp4` — Success - Returns the generated video

💻 **Example**

```bash
curl "https://gen.pollinations.ai/video/a%20sunset%20timelapse%20over%20the%20ocean?model=veo&width=1024" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

### Audio

#### `POST` `/v1/audio/voice-changer` — Transform a Voice

Transform the speaker identity in an audio file while preserving its words, timing, emotion, and delivery. Accepts preset voice names or custom ElevenLabs voice IDs.

📥 **Request body** · `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `model` | `string` | default: `"eleven-voice-changer"` |
| `audio` * | `string · binary` | Source audio, up to 50 MB. ElevenLabs supports clips up to five minutes. |
| `voice` | `string` | Target preset voice name or custom ElevenLabs voice ID. · default: `"alloy"` |
| `response_format` | `"mp3"` \| `"opus"` \| `"aac"` \| `"wav"` \| `"pcm"` | default: `"mp3"` |

<sub>`*` = required field</sub>

📤 **Response** · `200` · `audio/mpeg`, `audio/opus`, `audio/aac`, `audio/wav`, `audio/pcm` — Success - Returns transformed speech

💻 **Example**

```bash
curl -X POST "https://gen.pollinations.ai/v1/audio/voice-changer" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -F "audio=@./input.mp3"
```

---

#### `POST` `/v1/audio/voice-isolator` — Isolate Speech

Remove music, ambient sound, and other background noise from an audio or video file while preserving spoken audio.

📥 **Request body** · `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `model` | `string` | default: `"eleven-voice-isolator"` |
| `audio` * | `string · binary` | Source audio or video, up to 50 MB and at least 4.6 seconds long. |

<sub>`*` = required field</sub>

📤 **Response** · `200` · `audio/mpeg` — Success - Returns isolated speech as MP3 audio

💻 **Example**

```bash
curl -X POST "https://gen.pollinations.ai/v1/audio/voice-isolator" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -F "audio=@./input.mp3"
```

---

#### `POST` `/v1/audio/speech` — Generate Audio (OpenAI-compatible)

Generate speech, music, sound effects, or dialogue from text. Compatible with the OpenAI TTS API for JSON requests.

Set `model` to `elevenmusic`, `lyria-3-clip`, `stable-audio-3-medium`, or `stable-audio-3-large` to generate music. Lyria returns one fixed 30-second MP3 clip. Pass any publicly accessible audio URL as `reference_audio` to run audio-to-audio (style transfer) on `stable-audio-3-medium` or `stable-audio-3-large`, or reference-audio conditioning on `elevenmusic`; for ElevenLabs inpainting, pass a `composition_plan`.

For multi-speaker audio, set `model` to `eleven-dialogue` and put one turn per line in `input` as `<voice>: <text>`. Voice labels may be preset names or ElevenLabs voice IDs; the top-level `voice` field is ignored for this model. Dialogue supports up to 10 unique voices and 2,000 total text characters.

**Available voices:** alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, matilda, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill, conversational_a, conversational_b, read_speech_a, read_speech_b, read_speech_c, read_speech_d, af_alloy, af_aoede, af_bella, af_heart, af_jessica, af_kore, af_nicole, af_nova, af_river, af_sarah, af_sky, am_adam, am_echo, am_eric, am_fenrir, am_liam, am_michael, am_onyx, am_puck, am_santa, bf_alice, bf_emma, bf_isabella, bf_lily, bm_daniel, bm_fable, bm_george, bm_lewis, ef_dora, em_alex, em_santa, ff_siwis, hf_alpha, hf_beta, hm_omega, hm_psi, if_sara, im_nicola, jf_alpha, jf_gongitsune, jf_nezumi, jf_tebukuro, jm_kumo, pf_dora, pm_alex, pm_santa, zf_xiaobei, zf_xiaoni, zf_xiaoxiao, zf_xiaoyi, zm_yunjian, zm_yunxi, zm_yunxia, zm_yunyang

**Output formats:** mp3 (default), opus, aac, flac, wav, pcm

📥 **Request body** · `application/json`

| Field | Type | Description |
|---|---|---|
| `model` | `string` | — |
| `input` * | `string` | Text or prompt to generate. The `eleven-dialogue` model expects one `voice: text` turn per line. · length: `1…10000` |
| `safe` | `string` \| `boolean` | Optional safety features; accepts a comma-separated string or boolean shorthand. |
| `voice` | `string` | default: `"alloy"` |
| `response_format` | enum (6) — `"mp3"`, `"opus"`, `"aac"`, … | default: `"mp3"` |
| `duration` | `number` | range: `0.5…300` |
| `seconds` | `number` | range: `1…380` |
| `steps` | `integer` | range: `1…100` |
| `negative_prompt` | `string` | — |
| `instrumental` | `boolean` | — |
| `store_for_inpainting` | `boolean` | — |
| `reference_audio` | `string · uri` | Public HTTP(S) URL for reference-audio conditioning or audio-to-audio generation. |
| `conditioning_ref` | `object` | — |
| `composition_plan` | `object` | — |
| `seed` | `integer` | max: `4294967295` |
| `instructions` | `string` | — |
| `loop` | `boolean` | — |
| `prompt_influence` | `number` | max: `1` |

<sub>`*` = required field</sub>

📤 **Response** · `200` · `audio/mpeg`, `audio/opus`, `audio/aac`, `audio/flac`, `audio/wav`, `audio/pcm` — Success - Returns audio data

💻 **Example**

```bash
curl -X POST "https://gen.pollinations.ai/v1/audio/speech" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":"Hello world","voice":"nova"}'
```

---

#### `POST` `/v1/audio/speech/with-timestamps` — Generate Speech with Timestamps

Generate base64-encoded speech with character-level timing for the original and normalized text. Supports the elevenlabs, elevenflash, and eleven-multilingual-v2 models.

📥 **Request body** · `application/json`

| Field | Type | Description |
|---|---|---|
| `model` | `"elevenlabs"` \| `"elevenflash"` \| `"eleven-multilingual-v2"` | default: `"elevenlabs"` |
| `input` * | `string` | Text to synthesize and align. · max length: `10000` |
| `voice` | `string` | Preset voice name or custom ElevenLabs voice ID. · default: `"alloy"` |
| `response_format` | `"mp3"` \| `"opus"` \| `"aac"` \| `"wav"` \| `"pcm"` | Encoding used for audio_base64. · default: `"mp3"` |
| `seed` | `integer` | max: `4294967295` |

<sub>`*` = required field</sub>

📤 **Response** · `200` · `application/json` — Success - Returns base64 audio and character timings

| Field | Type | Description |
|---|---|---|
| `audio_base64` * | `string` | — |
| `alignment` * | `object` | — |
| `alignment.characters` | `string`[] | — |
| `alignment.character_start_times_seconds` | `number`[] | — |
| `alignment.character_end_times_seconds` | `number`[] | — |
| `normalized_alignment` * | `object` | — |
| `normalized_alignment.characters` | `string`[] | — |
| `normalized_alignment.character_start_times_seconds` | `number`[] | — |
| `normalized_alignment.character_end_times_seconds` | `number`[] | — |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl -X POST "https://gen.pollinations.ai/v1/audio/speech/with-timestamps" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":"Hello world","voice":"nova"}'
```

---

#### `POST` `/v1/audio/transcriptions` — Transcribe Audio

Transcribe audio files to text. Compatible with the OpenAI Whisper API.

**Supported audio formats:** mp3, mp4, mpeg, mpga, m4a, wav, webm

**Models:**
- `whisper-large-v3` (default) — OpenAI Whisper via OVHcloud
- `whisper-1` — Alias for whisper-large-v3
- `scribe` — ElevenLabs Scribe (90+ languages, word-level timestamps)
- `grok-transcribe` — xAI speech recognition with word timestamps, speaker labels, and text formatting
- `universal-2` — AssemblyAI Universal-2 (99 languages)
- `universal-3.5-pro` — AssemblyAI Universal-3.5 Pro (18 languages, code switching, prompting)

📥 **Request body** · `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `file` * | `string · binary` | The audio file to transcribe. Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm. |
| `model` | `string` | The model to use. Options: `whisper-large-v3`, `whisper-1`, `scribe`, `grok-transcribe`, `universal-2`, `universal-3.5-pro`. · default: `"whisper-large-v3"` |
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

Generate speech, dialogue, music, or sound effects from text via a simple GET request.

**Text-to-speech (default):** Returns spoken audio in the selected voice and format.

**Known voice presets:** alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, matilda, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill, conversational_a, conversational_b, read_speech_a, read_speech_b, read_speech_c, read_speech_d, af_alloy, af_aoede, af_bella, af_heart, af_jessica, af_kore, af_nicole, af_nova, af_river, af_sarah, af_sky, am_adam, am_echo, am_eric, am_fenrir, am_liam, am_michael, am_onyx, am_puck, am_santa, bf_alice, bf_emma, bf_isabella, bf_lily, bm_daniel, bm_fable, bm_george, bm_lewis, ef_dora, em_alex, em_santa, ff_siwis, hf_alpha, hf_beta, hm_omega, hm_psi, if_sara, im_nicola, jf_alpha, jf_gongitsune, jf_nezumi, jf_tebukuro, jm_kumo, pf_dora, pm_alex, pm_santa, zf_xiaobei, zf_xiaoni, zf_xiaoxiao, zf_xiaoyi, zm_yunjian, zm_yunxi, zm_yunxia, zm_yunyang. ElevenLabs models also accept a custom voice ID.

**Output formats:** mp3 (default), opus, aac, flac, wav, pcm

**Dialogue:** The `eleven-dialogue` model expects one `<voice>: <text>` turn per line.

**Music generation:** Set `model=elevenmusic`, `lyria-3-clip`, `stable-audio-3-medium`, or `stable-audio-3-large` to generate music instead of speech. `lyria-3-clip` returns a fixed 30-second MP3 clip; `elevenmusic` supports `duration` (3-300 seconds) and `instrumental` mode; `stable-audio-3-medium`/`stable-audio-3-large` support `seconds` (1-380), `steps`, `seed`, and `negative_prompt`. Pass any publicly accessible audio URL as `reference_audio` to `POST /v1/audio/speech`.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `text` * | `path` | `string` | Text or prompt to generate. The `eleven-dialogue` model expects one `voice: text` turn per line. |
| `voice` | `query` | `string` | Voice preset or custom provider voice ID. Dialogue voices come from labels in the text. · default: `"alloy"` |
| `response_format` | `query` | enum (6) — `"mp3"`, `"opus"`, `"aac"`, … | Audio output format. CSM and Kokoro support mp3, opus, flac, wav, and pcm; Qwen TTS currently returns WAV regardless of this setting; lyria-3-clip and eleven-sfx support mp3 only. · default: `"mp3"` |
| `model` | `query` | `string` | Audio model for speech, dialogue, music, or sound-effect generation |
| `duration` | `query` | `string` | Music duration in seconds (elevenmusic 3-300; lyria-3-clip fixed at 30) |
| `seconds` | `query` | `number` | Audio duration in seconds for stable-audio-3-medium/large, 1-380 · range: `1…380` |
| `steps` | `query` | `integer` | Sampling steps (stable-audio-3-medium 1-100, stable-audio-3-large 4-8) · range: `1…100` |
| `negative_prompt` | `query` | `string` | Negative prompt for stable-audio-3-large |
| `instrumental` | `query` | `"true"` \| `"false"` | If true, guarantees instrumental output (elevenmusic only) · default: `"false"` |
| `instructions` | `query` | `string` | Emotion/style instruction (qwen-tts-instruct only) |
| `loop` | `query` | `"true"` \| `"false"` | Loop the generated sound effect (eleven-sfx only) |
| `prompt_influence` | `query` | `string` | How strictly to follow the prompt, 0-1 (eleven-sfx only) |
| `seed` | `query` | `integer` | Seed passed to the model. Same seed + parameters return the same cached result while available. · range: `-1…4294967295` |
| `key` | `query` | `string` | API key (alternative to Authorization header) |
| `safe` | `query` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `audio/mpeg` — Success - Returns audio data

💻 **Example**

```bash
curl "https://gen.pollinations.ai/audio/Hello%2C%20welcome%20to%20Pollinations!?voice=nova&response_format=mp3" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

### Realtime

#### `GET` `/realtime` — Realtime WebSocket

OpenAI-compatible Realtime WebSocket for voice, multimodal, and transcription sessions.

Connect with `wss://gen.pollinations.ai/realtime?model=gpt-realtime-2.1` and send/receive OpenAI Realtime JSON events over the socket. Selecting `scribe-realtime` creates a transcription session automatically.
Server clients can authenticate with `Authorization: Bearer <key>`. Browser WebSocket clients can use `?key=pk_...` because they cannot set custom authorization headers.

**Models:** `gpt-realtime-2.1`, `gpt-realtime-2.1-mini`, `gpt-realtime-2`, `scribe-realtime`.

**Billing:** requires a positive balance and settles one session total when the socket closes.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `model` | `query` | `"gpt-realtime-2.1"` \| `"gpt-realtime-2.1-mini"` \| `"gpt-realtime-2"` \| `"scribe-realtime"` | Realtime model to use. Supported models: gpt-realtime-2.1, gpt-realtime-2.1-mini, gpt-realtime-2, scribe-realtime. · default: `"gpt-realtime-2.1"` |
| `key` | `query` | `string` | Pollinations API key. Useful for browser WebSocket clients that cannot set custom Authorization headers. |

<sub>`*` = required parameter</sub>

💻 **Example**

```bash
curl "https://gen.pollinations.ai/realtime?model=gpt-realtime-2.1&key=:key" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/v1/realtime` — Realtime WebSocket

OpenAI-compatible Realtime WebSocket for voice, multimodal, and transcription sessions.

Connect with `wss://gen.pollinations.ai/v1/realtime?model=gpt-realtime-2.1` and send/receive OpenAI Realtime JSON events over the socket. Selecting `scribe-realtime` creates a transcription session automatically.
Server clients can authenticate with `Authorization: Bearer <key>`. Browser WebSocket clients can use `?key=pk_...` because they cannot set custom authorization headers.

**Models:** `gpt-realtime-2.1`, `gpt-realtime-2.1-mini`, `gpt-realtime-2`, `scribe-realtime`.

**Billing:** requires a positive balance and settles one session total when the socket closes.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `model` | `query` | `"gpt-realtime-2.1"` \| `"gpt-realtime-2.1-mini"` \| `"gpt-realtime-2"` \| `"scribe-realtime"` | Realtime model to use. Supported models: gpt-realtime-2.1, gpt-realtime-2.1-mini, gpt-realtime-2, scribe-realtime. · default: `"gpt-realtime-2.1"` |
| `key` | `query` | `string` | Pollinations API key. Useful for browser WebSocket clients that cannot set custom Authorization headers. |

<sub>`*` = required parameter</sub>

💻 **Example**

```bash
curl "https://gen.pollinations.ai/v1/realtime?model=gpt-realtime-2.1&key=:key" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

### Embeddings

#### `GET` `/embeddings/models` — List Embedding Models

Returns available embedding models with pricing, capabilities, and supported input modalities. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance. Pass `?community=false` to exclude community models or `?community=true` to return only community models.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `community` | `query` | `"0"` \| `"1"` \| `"true"` \| `"false"` | Filter by community status: `true`/`1` for community-only, `false`/`0` for official-only. Omit for all models. |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `application/json` — Success

💻 **Example**

```bash
curl "https://gen.pollinations.ai/embeddings/models?community=0" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `POST` `/v1/embeddings` — Create Embeddings

Generate vector embeddings with an OpenAI-compatible response format.

**Models:** `gemini-2` supports text, image, audio, and video. `cohere-embed-v4` supports text and one image. OpenAI and Qwen embedding models are text-only.

**Input:** Pass a string, an array of up to 32 strings, or supported multimodal content parts (`text`, `image_url`, `input_audio`, `video_url`) in the `input` field.

**Retrieval roles:** Use `task_type` with Gemini text input; it is converted to the model's recommended prompt instruction. Use `input_type` (`query` or `document`) with Cohere.

**Billing:** Gemini task instructions count toward prompt token usage. Cohere image requests expose one combined usage count, so text accompanying an image is billed at the image-input rate.

**Gemini migration:** `gemini-2` uses the GA embedding space. Do not mix preview-era and GA vectors; re-embed stored `gemini-2` data before comparing it with new results.

**Dimensions:** Defaults are model-specific. Qwen supports up to 4096; Gemini and OpenAI large up to 3072; OpenAI small up to 1536; Cohere supports 256, 512, 1024, or 1536.

📥 **Request body** · `application/json`

| Field | Type | Description |
|---|---|---|
| `model` | `string` | Embedding model to use · default: `"openai-3-small"` |
| `input` * | `string` \| `string`[] \| `object` \| `object`[] | Input text or content parts to embed. Supports strings, arrays of strings (max 32 inputs), or multimodal content parts (text, image_url, input_audio, video_url). Gemini supports every listed modality; Cohere Embed v4 supports text and one image per input. |
| `dimensions` | `integer` | Output embedding dimensions (128-4096). Model-specific limits apply; Cohere supports 256, 512, 1024, or 1536. · range: `128…4096` |
| `task_type` | enum (8) — `"SEMANTIC_SIMILARITY"`, `"CLASSIFICATION"`, `"CLUSTERING"`, … | Gemini text-specific task hint, converted to the model's recommended prompt instruction |
| `input_type` | `"query"` \| `"document"` | Cohere-specific input role for retrieval. Use document when indexing and query when searching. |
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

### Models

#### `GET` `/v1/models` — List Models (OpenAI-compatible)

Returns available models in the OpenAI-compatible format (`{object: "list", data: [...]}`), with Pollinations pricing and capability extensions. Official models are ordered by modality (text, image, video, 3D, audio, realtime, embedding), with each configured default first, followed by stable and then alpha/preview models from newest to oldest. Community models follow from newest to oldest. Use `/models`, `/text/models`, `/image/models`, `/audio/models`, or `/embeddings/models` for richer metadata. When authenticated: the owner's private community models are included, models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance. Pass `?community=false` to exclude community models or `?community=true` to return only community models.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `community` | `query` | `"0"` \| `"1"` \| `"true"` \| `"false"` | Filter by community status: `true`/`1` for community-only, `false`/`0` for official-only. Omit for all models. |

<sub>`*` = required parameter</sub>

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
| `data[].agent` | `boolean` | — |
| `data[].base_model` | `string` | — |
| `data[].pricing` | `object` | — |
| `data[].capabilities` | `string`[] | — |
| `data[].tools` | `boolean` | — |
| `data[].reasoning` | `boolean` | — |
| `data[].context_length` | `number` | — |
| `data[].per_user_rpm` | `number` \| `null` | — |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl "https://gen.pollinations.ai/v1/models?community=0" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

```json
{
  "object": "list",
  "data": [
    {
      "id": "openai",
      "object": "model",
      "created": 1700000000,
      "owned_by": "pollinations"
    },
    {
      "id": "claude",
      "object": "model",
      "created": 1700000000,
      "owned_by": "pollinations"
    },
    {
      "id": "gemini",
      "object": "model",
      "created": 1700000000,
      "owned_by": "pollinations"
    }
  ]
}
```

---

#### `GET` `/models` — List Models

Returns all available models with pricing, capabilities, and metadata. Official models are ordered by modality (text, image, video, 3D, audio, realtime, embedding), with each configured default first, followed by stable and then alpha/preview models from newest to oldest. Community models follow from newest to oldest. When authenticated: the owner's private community models are included, models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance. Pass `?community=false` to exclude community models or `?community=true` to return only community models.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `community` | `query` | `"0"` \| `"1"` \| `"true"` \| `"false"` | Filter by community status: `true`/`1` for community-only, `false`/`0` for official-only. Omit for all models. |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `application/json` — Success

💻 **Example**

```bash
curl "https://gen.pollinations.ai/models?community=0" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/3d/models` — List 3D Models

Returns all available 3D model generation models with pricing, capabilities, and metadata. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance. Pass `?community=false` to exclude community models or `?community=true` to return only community models.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `community` | `query` | `"0"` \| `"1"` \| `"true"` \| `"false"` | Filter by community status: `true`/`1` for community-only, `false`/`0` for official-only. Omit for all models. |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `application/json` — Success

💻 **Example**

```bash
curl "https://gen.pollinations.ai/3d/models?community=0" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/image/models` — List Image & Video Models

Returns all available image and video generation models with pricing, capabilities, and metadata. Video models are included here — check the `outputModalities` field to distinguish image vs video models. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance. Pass `?community=false` to exclude community models or `?community=true` to return only community models.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `community` | `query` | `"0"` \| `"1"` \| `"true"` \| `"false"` | Filter by community status: `true`/`1` for community-only, `false`/`0` for official-only. Omit for all models. |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `application/json` — Success

💻 **Example**

```bash
curl "https://gen.pollinations.ai/image/models?community=0" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/video/models` — List Video Models

Returns all available video generation models with pricing, capabilities, and metadata. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance. Pass `?community=false` to exclude community models or `?community=true` to return only community models.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `community` | `query` | `"0"` \| `"1"` \| `"true"` \| `"false"` | Filter by community status: `true`/`1` for community-only, `false`/`0` for official-only. Omit for all models. |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `application/json` — Success

💻 **Example**

```bash
curl "https://gen.pollinations.ai/video/models?community=0" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/text/models` — List Text Models (Detailed)

Returns all available text generation and community text models with pricing, capabilities, and metadata including context window size, supported modalities, and tool support. When authenticated: the owner's private community models are included, models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance. Pass `?community=false` to exclude community models or `?community=true` to return only community models.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `community` | `query` | `"0"` \| `"1"` \| `"true"` \| `"false"` | Filter by community status: `true`/`1` for community-only, `false`/`0` for official-only. Omit for all models. |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `application/json` — Success

💻 **Example**

```bash
curl "https://gen.pollinations.ai/text/models?community=0" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/audio/models` — List Audio Models

Returns all available audio models (text-to-speech, music generation, and transcription) with pricing, capabilities, and metadata. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance. Pass `?community=false` to exclude community models or `?community=true` to return only community models.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `community` | `query` | `"0"` \| `"1"` \| `"true"` \| `"false"` | Filter by community status: `true`/`1` for community-only, `false`/`0` for official-only. Omit for all models. |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `application/json` — Success

💻 **Example**

```bash
curl "https://gen.pollinations.ai/audio/models?community=0" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

### Media Storage

#### `POST` `/upload` — Upload media

Upload an image, audio, or video file via multipart/form-data (field `file`) or application/json (base64 `data`). Returns a unique id and its retrieval URL; each upload gets its own id (re-uploading the same bytes yields a new one). Files are retained for 30 days.

**Tags publish.** An optional `tags` field publishes the upload into each tag's public gallery (GET /media?tag=…), where anyone can see it. Untagged uploads stay unlisted: reachable only by their unguessable id URL, never listed anywhere. **Alpha:** the publish tagging is new and may still change.

📥 **Request body** · `application/json`

| Field | Type | Description |
|---|---|---|
| `data` * | `string` | Base64-encoded file bytes (with or without a data: prefix). |
| `contentType` | `string` | MIME type; defaults to application/octet-stream. |
| `name` | `string` | Filename; used for the download Content-Disposition. |
| `tags` | `string` \| `string`[] | Tags (publish the upload to those tags' public galleries): a comma-separated string or an array of strings. |

<sub>`*` = required field</sub>

📤 **Response** · `200` · `application/json` — Upload successful

| Field | Type | Description |
|---|---|---|
| `id` * | `string` | Unique media id (also the retrieval id) |
| `url` * | `string` | Public retrieval URL |
| `contentType` * | `string` | — |
| `size` * | `integer` | File size in bytes |
| `tags` | `string`[] | Tags the upload was published with; present only when tagged |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl -X POST "https://media.pollinations.ai/upload" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -F "file=@./image.png"
```

---

#### `GET` `/media` — List a public tag gallery

List the public gallery for a tag: every published item carrying that tag, any owner, newest first. Tagging an upload is what publishes it, so galleries are fully public — no API key needed. `tag` is required.

Items reference storage with a 30-day lifecycle. A GET refreshes the lifecycle once an object is at least 15 days old. An expired item keeps its catalog entry, but its url 404s. **Alpha:** this endpoint is new and its API may still change.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `tag` * | `query` | `string` | Required. The public gallery to list: items carrying this tag, any owner. |
| `limit` | `query` | `integer` | Page size, 1–100. Omitted → 20. · range: `1…100` |
| `cursor` | `query` | `string` | Opaque pagination cursor from a previous response's nextCursor. |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `application/json` — Page of media items

| Field | Type | Description |
|---|---|---|
| `items` * | `object`[] | — |
| `items[].id` * | `string` | Catalog item id |
| `items[].url` * | `string` | Public retrieval URL |
| `items[].contentType` * | `string` | — |
| `items[].size` * | `integer` \| `null` | File size in bytes |
| `items[].tags` * | `string`[] | — |
| `items[].createdAt` * | `string` | ISO-8601 timestamp |
| `nextCursor` * | `string` \| `null` | Opaque cursor for the next page, null when exhausted. Treat it as a token: pass it back verbatim as `?cursor=` to fetch the next page — do not parse or construct it. |
| `hasMore` * | `boolean` | true when more pages exist (nextCursor is non-null). Loop while hasMore is true. |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl "https://media.pollinations.ai/media?tag=:tag&limit=:limit"
```

---

#### `DELETE` `/media/{id}` — Delete media

Delete a published media item you own: the file, its catalog entry, and all its tags are removed, so it disappears from galleries and its URL 404s. Requires your **secret (`sk_`)** API key. Untagged uploads were never published, have no catalog entry, and can't be deleted — they use the same 30-day lifecycle, refreshed by a GET once they are at least 15 days old. **Alpha:** this endpoint is new and its API may still change.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `id` * | `path` | `string` | Media id (from the upload response or GET /media). |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `application/json` — Item deleted

| Field | Type | Description |
|---|---|---|
| `deleted` * | `"true"` | — |
| `id` * | `string` | Id of the deleted media item |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl -X DELETE "https://media.pollinations.ai/media/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `GET` `/{id}` — Retrieve media

Get a file by its id. Access keeps files from expiring.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `id` * | `path` | `string` | — |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` — File content with appropriate Content-Type

💻 **Example**

```bash
curl "https://media.pollinations.ai/550e8400-e29b-41d4-a716-446655440000"
```

---

#### `HEAD` `/{id}` — Check if media exists

Check existence and metadata without downloading the file.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `id` * | `path` | `string` | — |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` — File exists (headers include Content-Type, Content-Length, X-Content-Id)

💻 **Example**

```bash
curl -X HEAD "https://media.pollinations.ai/550e8400-e29b-41d4-a716-446655440000"
```

---

#### `GET` `/{id}/metadata` — Get file metadata

Return file metadata (id, content type, size, upload timestamp) as JSON without downloading the file body.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `id` * | `path` | `string` | — |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `application/json` — File metadata

| Field | Type | Description |
|---|---|---|
| `id` * | `string` | Unique media id |
| `contentType` * | `string` | — |
| `size` * | `integer` | File size in bytes |
| `uploadedAt` | `string` | ISO-8601 upload timestamp, when recorded |

<sub>`*` = required field</sub>

💻 **Example**

```bash
curl "https://media.pollinations.ai/550e8400-e29b-41d4-a716-446655440000/metadata"
```

### 📊 Monitor

#### `GET` `/v1/models/status` — Model Health Status

Returns raw model health rows from the public Tinybird `model_health` pipe.

The optional `minutes` query parameter controls the rolling window and must be an integer between 1 and 10080.
The X-Model-Status-Timestamp response header reports when the data was fetched from Tinybird; X-Model-Status-Stale is set when stale data is returned during an upstream failure.

📤 **Response** · `200` · `application/json` — Success

💻 **Example**

```bash
curl "https://gen.pollinations.ai/v1/models/status" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

### 3D

#### `GET` `/3d/{prompt}` — Generate 3D Model

Generate a 3D model from a text prompt or reference image(s). Returns GLB by default.

**Available models:** `trellis-2`, `hyper3d-rodin`. `trellis-2` is the default.

Pass reference image URL(s) via the `image` parameter for image-to-3D models (`trellis-2`). Separate multiple URLs with `|` or `,`. `hyper3d-rodin` accepts both images and a text prompt.

Browse all available models and their input requirements at [`/3d/models`](https://gen.pollinations.ai/3d/models).

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `prompt` * | `path` | `string` | Text description of the 3D model to generate (required for text-to-3D models such as Hyper3D Rodin; ignored by image-only models such as Trellis 2) |
| `model` * | `query` | enum (6) — `"trellis-2"`, `"hyper3d-rodin"`, `"trellis-2-low"`, … | Model to use. See /3d/models for the full list and per-model input requirements. · default: `"trellis-2"` |
| `resolution` | `query` | `"low"` \| `"medium"` \| `"high"` | Output detail for `trellis-2`. Defaults to `low`. |
| `image` | `query` | `string` | Reference image URL(s) for image-to-3D generation. Separate multiple URLs with `\|` or `,`. Required for image-only models (e.g. `trellis`, `triposr`, `sf3d`). |
| `seed` | `query` | `integer` | Seed for varied generations. Passed through to models that support it (`hyper3d-rodin`); otherwise only affects the media-cache key, so a new seed forces a fresh generation for the same prompt/image. |
| `safe` | `query` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |

<sub>`*` = required parameter</sub>

📤 **Response** · `200` · `model/gltf-binary` — Success - Returns the generated 3D model

💻 **Example**

```bash
curl "https://gen.pollinations.ai/3d/a%20low-poly%20treasure%20chest?model=trellis-2&resolution=low" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

---

#### `POST` `/3d/{prompt}` — Generate 3D Model With JSON

Generate a 3D model from a text prompt or reference image using JSON parameters. `trellis-2` supports `low`, `medium`, and `high` resolution with variable pricing.

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `prompt` * | `path` | `string` | Text description of the 3D model to generate (required for text-to-3D models; ignored by image-only models) |
| `key` | `query` | `string` | API key (alternative to Authorization header) |
| `safe` | `query` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |

<sub>`*` = required parameter</sub>

📥 **Request body** · `application/json`

| Field | Type | Description |
|---|---|---|
| `model` | enum (6) — `"trellis-2"`, `"hyper3d-rodin"`, `"trellis-2-low"`, … | Model to use for 3D generation. See /3d/models for the full list and per-model input requirements. · default: `"trellis-2"` |
| `image` | `string` \| `string`[] | Reference image URL or array of URLs for image-to-3D generation, optionally guided by the path prompt on supported models. A string is treated as one complete URL. |
| `resolution` | `"low"` \| `"medium"` \| `"high"` | Output voxel-grid resolution for `trellis-2`: `low` (512³), `medium` (1024³), or `high` (1536³). Higher resolutions add detail, take longer, and cost more. · default: `"low"` |
| `seed` | `integer` | Seed for varied generations. Passed to models that support it. |

<sub>`*` = required field</sub>

📤 **Response** · `200` · `model/gltf-binary` — Success - Returns the generated 3D model

💻 **Example**

```bash
curl -X POST "https://gen.pollinations.ai/3d/a%20low-poly%20treasure%20chest?key=:key&safe=:safe" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"hyper3d-rodin"}'
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
| `400` | `invalid_image_url` | A supplied image URL is malformed, not HTTP(S), points at a private or credentialed host, or redirects. Provide a direct public image URL. |
| `400` | `failed_to_download_image` | A supplied image URL could not be downloaded — host unreachable, DNS failure, a non-2xx response from the image host, or a body that ended mid-read. The host's status is reported in `details.upstreamStatus`. |
| `400` | `image_too_large` | A supplied image exceeds the per-image size cap, or the request exceeds the per-request image size or count cap. |
| `400` | `unsupported_image_media_type` | A supplied image declares no media type and could not be recognized from its content. A declared media type is forwarded to the provider as-is, so whether a given format is usable is answered by the provider, not here. |
| `401` | `UNAUTHORIZED` | Missing or invalid API key. Provide via `Authorization: Bearer <key>` header or `?key=<key>` query param. |
| `402` | `PAYMENT_REQUIRED` | Insufficient pollen balance or API key budget exhausted. |
| `403` | `FORBIDDEN` | Access denied — insufficient permissions or paid-model access for this model. |
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

Marks the end of a static prompt prefix to cache (Gemini, Claude, and Nova models). Place on the final content block of the prefix; repeat requests bill the cached prefix at ~10% of the input rate. See Text Generation → Prompt caching.

| Field | Type | Description |
|---|---|---|
| `type` * | `"ephemeral"` | — |

<sub>`*` = required field</sub>

### `CompletionUsage`

| Field | Type | Description |
|---|---|---|
| `cached_input_tokens` | `integer` \| `null` | — |
| `cache_creation_input_tokens` | `integer` \| `null` | — |
| `cache_read_input_tokens` | `integer` \| `null` | — |
| `completion_tokens` * | `integer` | — |
| `completion_tokens_details` | `object` \| `null` | — |
| `prompt_tokens` * | `integer` | — |
| `prompt_tokens_details` | `object` \| `null` | — |
| `reasoning_tokens` | `integer` \| `null` | — |
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
| `input` * | `string` \| `string`[] \| `object` \| `object`[] | Input text or content parts to embed. Supports strings, arrays of strings (max 32 inputs), or multimodal content parts (text, image_url, input_audio, video_url). Gemini supports every listed modality; Cohere Embed v4 supports text and one image per input. |
| `dimensions` | `integer` | Output embedding dimensions (128-4096). Model-specific limits apply; Cohere supports 256, 512, 1024, or 1536. · range: `128…4096` |
| `task_type` | enum (8) — `"SEMANTIC_SIMILARITY"`, `"CLASSIFICATION"`, `"CLUSTERING"`, … | Gemini text-specific task hint, converted to the model's recommended prompt instruction |
| `input_type` | `"query"` \| `"document"` | Cohere-specific input role for retrieval. Use document when indexing and query when searching. |
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
| `resolution` | enum (6) — `"1k"`, `"2k"`, `"480p"`, … | Output resolution for resolution-priced image and video models (Pollinations extension) |
| `safe` | `string` \| `boolean` | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |

<sub>`*` = required field</sub>

### `CreateImageResponse`

| Field | Type | Description |
|---|---|---|
| `created` * | `integer` | — |
| `data` * | `object`[] | — |
| `data[].url` | `string` | — |
| `data[].b64_json` | `string` | — |
| `data[].media_type` | `string` | MIME type for non-raster output such as image/svg+xml |
| `data[].revised_prompt` | `string` | — |
| `usage` * | `object` | — |
| `usage.input_tokens` * | `integer` | — |
| `usage.output_tokens` * | `integer` | — |
| `usage.total_tokens` * | `integer` | — |
| `usage.input_tokens_details` * | `object` | — |

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
