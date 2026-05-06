# Pollinations API

- **OpenAPI Version:** `3.1.0`
- **API Version:** `0.3.0`

## Introduction

Generate text, images, video, and audio with a single API. OpenAI-compatible — use any OpenAI SDK by changing the base URL.

**Base URL:** `https://gen.pollinations.ai`

**Get your API key:** [enter.pollinations.ai](https://enter.pollinations.ai)

## Overview

| Capability               | Endpoint                        | Format            |
| ------------------------ | ------------------------------- | ----------------- |
| ✍️ **Text Generation**   | `POST /v1/chat/completions`     | OpenAI-compatible |
| ✍️ **Simple Text**       | `GET /text/{prompt}`            | Plain text        |
| 🖼️ **Image Generation** | `GET /image/{prompt}`           | JPEG / PNG        |
| 🎬 **Video Generation**  | `GET /video/{prompt}`           | MP4               |
| 🔊 **Text-to-Speech**    | `GET /audio/{text}`             | MP3               |
| 🔊 **Music Generation**  | `GET /audio/{text}`             | MP3               |
| 🔊 **Transcription**     | `POST /v1/audio/transcriptions` | JSON              |
| 🤖 **Model Discovery**   | `GET /v1/models`                | JSON              |

## Quick Start

### Generate an Image

Paste this URL in your browser — no code needed:

```perl
https://gen.pollinations.ai/image/a%20cat%20in%20space
```

Or use it directly in HTML:

```html
<img src="https://gen.pollinations.ai/image/a%20cat%20in%20space" />
```

### Generate Text (OpenAI-compatible)

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai", "messages": [{"role": "user", "content": "Hello!"}]}'
```

### Generate Speech

```bash
curl "https://gen.pollinations.ai/audio/Hello%20world?voice=nova" \
  -H "Authorization: Bearer YOUR_API_KEY" -o speech.mp3
```

## 🔐 Authentication

All generation requests require an API key from [enter.pollinations.ai](https://enter.pollinations.ai). Model listing endpoints work without authentication.

**Two key types:**

| Type        | Prefix | Use case                | Rate limits      |
| ----------- | ------ | ----------------------- | ---------------- |
| Secret      | `sk_`  | Server-side apps        | None             |
| Publishable | `pk_`  | Client-side apps (beta) | 1 pollen/IP/hour |

**How to authenticate:**

```bash
# Option 1: Authorization header (recommended)
curl -H "Authorization: Bearer YOUR_API_KEY" ...

# Option 2: Query parameter
curl "https://gen.pollinations.ai/text/hello?key=YOUR_API_KEY"
```

> **Warning:** Never expose secret keys (`sk_`) in client-side code. Use publishable keys (`pk_`) for frontend apps.

## Servers

- **URL:** `https://gen.pollinations.ai`

## Operations

### Get Profile

- **Method:** `GET`
- **Path:** `/account/profile`
- **Tags:** 👤 Account

Returns your account profile. GitHub username, profile image, current tier, and next pollen refill timestamp are always returned. Name and email are returned only when the API key has the `account:profile` permission.

#### Responses

##### Status: 200 User profile

###### Content-Type: application/json

- **`githubUsername` (required)**

  `object` — GitHub username if linked

- **`image` (required)**

  `object` — Profile picture URL (e.g. GitHub avatar)

- **`nextResetAt` (required)**

  `object` — Next pollen refill timestamp (ISO 8601). \`null\` for tiers with no refill.

- **`tier` (required)**

  `string`, possible values: `"anonymous", "microbe", "spore", "seed", "flower", "nectar", "router"` — User's current tier level

- **`email`**

  `object` — User's email address (only returned when the key has \`account:profile\`)

- **`name`**

  `object` — User's display name (only returned when the key has \`account:profile\`)

**Example:**

```json
{
  "tier": "anonymous"
}
```

### Get Balance

- **Method:** `GET`
- **Path:** `/account/balance`
- **Tags:** 👤 Account

Returns the pollen balance visible to the caller. API keys with a budget always see their remaining budget (no scope needed). Session auth or API keys with the `account:usage` scope see the full account balance.

#### Responses

##### Status: 200 Pollen balance

###### Content-Type: application/json

- **`balance` (required)**

  `number` — Remaining pollen balance (combines tier, pack, and crypto balances)

**Example:**

```json
{
  "balance": 1
}
```

### Get Usage History

- **Method:** `GET`
- **Path:** `/account/usage`
- **Tags:** 👤 Account

Returns your request history with per-request details: model used, token counts, cost, and response time. Defaults to the last 30 days, supports up to 90 days via `days`, or exact day/week/month periods via `granularity` and `period`. Supports JSON and CSV export. Each response is capped at 50,000 rows. Use `before` for cursor-based pagination. Requires `account:usage` permission when using API keys.

#### Responses

##### Status: 200 Usage records

###### Content-Type: application/json

- **`count` (required)**

  `number` — Number of records returned

- **`usage` (required)**

  `array` — Array of usage records

  **Items:**

  - **`api_key` (required)**

    `object` — API key identifier used (masked)

  - **`api_key_type` (required)**

    `object` — Type of API key ('secret', 'publishable')

  - **`cost_usd` (required)**

    `number` — Cost in USD for this request

  - **`input_audio_tokens` (required)**

    `number` — Number of input audio tokens

  - **`input_cached_tokens` (required)**

    `number` — Number of cached input tokens

  - **`input_image_tokens` (required)**

    `number` — Number of input image tokens

  - **`input_text_tokens` (required)**

    `number` — Number of input text tokens

  - **`meter_source` (required)**

    `object` — Billing source ('tier', 'pack', 'crypto')

  - **`model` (required)**

    `object` — Model used for generation

  - **`output_audio_tokens` (required)**

    `number` — Number of output audio tokens

  - **`output_image_tokens` (required)**

    `number` — Number of output image tokens (1 per image)

  - **`output_reasoning_tokens` (required)**

    `number` — Number of reasoning tokens (for models with chain-of-thought)

  - **`output_text_tokens` (required)**

    `number` — Number of output text tokens

  - **`response_time_ms` (required)**

    `object` — Response time in milliseconds

  - **`timestamp` (required)**

    `string` — Request timestamp (YYYY-MM-DD HH:mm:ss format)

  - **`type` (required)**

    `string` — Request type (e.g., 'generate.image', 'generate.text')

**Example:**

```json
{
  "usage": [
    {
      "input_text_tokens": 1,
      "input_cached_tokens": 1,
      "input_audio_tokens": 1,
      "input_image_tokens": 1,
      "output_text_tokens": 1,
      "output_reasoning_tokens": 1,
      "output_audio_tokens": 1,
      "output_image_tokens": 1,
      "cost_usd": 1,
      "response_time_ms": 1
    }
  ],
  "count": 1
}
```

### Get Daily Usage

- **Method:** `GET`
- **Path:** `/account/usage/daily`
- **Tags:** 👤 Account

Returns daily aggregated usage for the requested time window, grouped by date and model. Use `days` for rolling windows or `granularity` and `period` for exact day/week/month periods. Useful for dashboards and spending analysis. Supports JSON and CSV export. Results are cached for 1 hour. Requires `account:usage` permission when using API keys.

#### Responses

##### Status: 200 Daily usage records aggregated by date/model

###### Content-Type: application/json

- **`count` (required)**

  `number` — Number of records returned

- **`usage` (required)**

  `array` — Array of daily usage records

  **Items:**

  - **`cost_usd` (required)**

    `number` — Total cost in USD

  - **`date` (required)**

    `string` — Date (YYYY-MM-DD format)

  - **`meter_source` (required)**

    `object` — Billing source ('tier', 'pack', 'crypto')

  - **`model` (required)**

    `object` — Model used

  - **`requests` (required)**

    `number` — Number of requests

**Example:**

```json
{
  "usage": [
    {
      "requests": 1,
      "cost_usd": 1
    }
  ],
  "count": 1
}
```

### List API Keys

- **Method:** `GET`
- **Path:** `/account/keys`
- **Tags:** 👤 Account

List all API keys for the current user. Requires `account:keys` permission when using API keys. Secret key values are never returned.

#### Responses

##### Status: 200 List of API keys

### Create API Key

- **Method:** `POST`
- **Path:** `/account/keys`
- **Tags:** 👤 Account

Create a new API key. Requires `account:keys` permission and a secret key (sk\_). The full key value is returned only once in the response. The `keys` account permission is automatically stripped from child keys to prevent escalation.

#### Request Body

##### Content-Type: application/json

- **`name` (required)**

  `string` — Name for the API key

- **`accountPermissions`**

  `object` — Account permissions (e.g. \["usage"]). "keys" is auto-stripped.

- **`allowedModels`**

  `object` — Model IDs this key can access. null = all models

- **`expiresIn`**

  `integer` — Expiry in seconds from now (max 365 days)

- **`pollenBudget`**

  `object` — Pollen budget cap. null = unlimited

- **`redirectUris`**

  `array` — Allowed OAuth redirect URIs for publishable app keys. Loopback ports are matched port-agnostically.

  **Items:**

  `string`

- **`type`**

  `string`, possible values: `"secret", "publishable"`, default: `"secret"` — Key type: secret (sk\_) or publishable (pk\_)

**Example:**

```json
{
  "type": "secret",
  "expiresIn": 1,
  "allowedModels": [
    ""
  ],
  "pollenBudget": 1,
  "accountPermissions": [
    ""
  ],
  "redirectUris": [
    ""
  ]
}
```

#### Responses

##### Status: 200 Created API key with full secret

### Revoke API Key

- **Method:** `DELETE`
- **Path:** `/account/keys/{id}`
- **Tags:** 👤 Account

Delete/revoke an API key. Requires `account:keys` permission and a secret key (sk\_). Cannot revoke the key used to authenticate the request.

#### Responses

##### Status: 200 Key revoked

### Get API Key Info

- **Method:** `GET`
- **Path:** `/account/key`
- **Tags:** 👤 Account

Returns information about the API key used in the request: validity, type (secret/publishable), expiry, permissions, and remaining budget. Useful for validating keys without making generation requests.

#### Responses

##### Status: 200 API key status and information

###### Content-Type: application/json

- **`expiresAt` (required)**

  `object` — Expiry timestamp in ISO 8601 format, null if never expires

- **`expiresIn` (required)**

  `object` — Seconds until expiry, null if never expires

- **`name` (required)**

  `object` — Display name of the API key

- **`permissions` (required)**

  `object` — API key permissions

  - **`account` (required)**

    `object` — List of account permissions, null = no account access

  - **`models` (required)**

    `object` — List of allowed model IDs, null = all models allowed

- **`pollenBudget` (required)**

  `object` — Remaining pollen budget for this key, null = unlimited (uses user balance)

- **`rateLimitEnabled` (required)**

  `boolean` — Whether rate limiting is enabled for this key

- **`type` (required)**

  `string`, possible values: `"publishable", "secret"` — Type of API key

- **`valid` (required)**

  `boolean` — Whether the API key is valid and active

**Example:**

```json
{
  "valid": true,
  "type": "publishable",
  "expiresIn": 1,
  "permissions": {
    "models": [
      ""
    ],
    "account": [
      ""
    ]
  },
  "pollenBudget": 1,
  "rateLimitEnabled": true
}
```

### Get API Key Usage

- **Method:** `GET`
- **Path:** `/account/key/usage`
- **Tags:** 👤 Account

Returns usage history for the API key used in the request. No scope required — a key can always read its own usage. For account-wide usage across all keys, use `/account/usage` with the `account:usage` scope.

#### Responses

##### Status: 200 Usage records for this key

###### Content-Type: application/json

- **`count` (required)**

  `number` — Number of records returned

- **`usage` (required)**

  `array` — Array of usage records

  **Items:**

  - **`api_key` (required)**

    `object` — API key identifier used (masked)

  - **`api_key_type` (required)**

    `object` — Type of API key ('secret', 'publishable')

  - **`cost_usd` (required)**

    `number` — Cost in USD for this request

  - **`input_audio_tokens` (required)**

    `number` — Number of input audio tokens

  - **`input_cached_tokens` (required)**

    `number` — Number of cached input tokens

  - **`input_image_tokens` (required)**

    `number` — Number of input image tokens

  - **`input_text_tokens` (required)**

    `number` — Number of input text tokens

  - **`meter_source` (required)**

    `object` — Billing source ('tier', 'pack', 'crypto')

  - **`model` (required)**

    `object` — Model used for generation

  - **`output_audio_tokens` (required)**

    `number` — Number of output audio tokens

  - **`output_image_tokens` (required)**

    `number` — Number of output image tokens (1 per image)

  - **`output_reasoning_tokens` (required)**

    `number` — Number of reasoning tokens (for models with chain-of-thought)

  - **`output_text_tokens` (required)**

    `number` — Number of output text tokens

  - **`response_time_ms` (required)**

    `object` — Response time in milliseconds

  - **`timestamp` (required)**

    `string` — Request timestamp (YYYY-MM-DD HH:mm:ss format)

  - **`type` (required)**

    `string` — Request type (e.g., 'generate.image', 'generate.text')

**Example:**

```json
{
  "usage": [
    {
      "input_text_tokens": 1,
      "input_cached_tokens": 1,
      "input_audio_tokens": 1,
      "input_image_tokens": 1,
      "output_text_tokens": 1,
      "output_reasoning_tokens": 1,
      "output_audio_tokens": 1,
      "output_image_tokens": 1,
      "cost_usd": 1,
      "response_time_ms": 1
    }
  ],
  "count": 1
}
```

### Text to Speech (OpenAI-compatible)

- **Method:** `POST`
- **Path:** `/v1/audio/speech`
- **Tags:** 🔊 Audio Generation

Generate speech or music from text. Compatible with the OpenAI TTS API — use any OpenAI SDK.

Set `model` to `elevenmusic` to generate music instead of speech.

**Available voices:** alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, matilda, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill

**Output formats:** mp3 (default), opus, aac, flac, wav, pcm

#### Request Body

##### Content-Type: application/json

- **`input` (required)**

  `string` — The text to generate audio for. Maximum 4096 characters.

- **`duration`**

  `number` — Music duration in seconds, 3-300 (elevenmusic/acestep)

- **`instruct`**

  `string` — Emotion/style instruction (qwen-tts-instruct only). e.g. 'excited and cheerful'.

- **`instrumental`**

  `boolean` — If true, guarantees instrumental output (elevenmusic only)

- **`model`**

  `string`

- **`response_format`**

  `string`, possible values: `"mp3", "opus", "aac", "flac", "wav", "pcm"`, default: `"mp3"` — The audio format for the output. Qwen TTS currently returns WAV regardless of this setting.

- **`safe`**

  `object` — Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off.

- **`seed`**

  `integer` — Seed for deterministic output. Same seed + params = best-effort return of the same cached result. Omit for random.

- **`speed`**

  `number`, default: `1` — The speed of the generated audio. 0.25 to 4.0, default 1.0.

- **`style`**

  `string` — Style/genre tags for music generation (acestep only). If omitted, style is auto-detected from the input text.

- **`voice`**

  `string`, default: `"alloy"` — The voice to use. Can be any preset name (alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, matilda, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill) OR a custom ElevenLabs voice ID (UUID from your dashboard).

**Example:**

```json
{
  "input": "Hello, welcome to Pollinations!",
  "voice": "rachel",
  "response_format": "mp3",
  "speed": 1,
  "duration": 30,
  "instrumental": false,
  "seed": 42,
  "style": "brazilian berimbau instrumental",
  "instruct": "speak softly and warmly"
}
```

#### Responses

##### Status: 200 Success - Returns audio data

###### Content-Type: audio/mpeg

`string`, format: `binary`

**Example:**

###### Content-Type: audio/opus

`string`, format: `binary`

**Example:**

###### Content-Type: audio/aac

`string`, format: `binary`

**Example:**

###### Content-Type: audio/flac

`string`, format: `binary`

**Example:**

###### Content-Type: audio/wav

`string`, format: `binary`

**Example:**

### Transcribe Audio

- **Method:** `POST`
- **Path:** `/v1/audio/transcriptions`
- **Tags:** 🔊 Audio Generation

Transcribe audio files to text. Compatible with the OpenAI Whisper API.

**Supported audio formats:** mp3, mp4, mpeg, mpga, m4a, wav, webm

**Models:**

- `whisper-large-v3` (default) — OpenAI Whisper via OVHcloud
- `whisper-1` — Alias for whisper-large-v3
- `scribe` — ElevenLabs Scribe (90+ languages, word-level timestamps)
- `universal-2` — AssemblyAI Universal-2 (99 languages)
- `universal-3-pro` — AssemblyAI Universal-3 Pro (highest accuracy, prompting)

#### Request Body

##### Content-Type: multipart/form-data

- **`file` (required)**

  `string`, format: `binary` — The audio file to transcribe. Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm.

- **`language`**

  `string` — Language of the audio in ISO-639-1 format (e.g. \`en\`, \`fr\`). Improves accuracy.

- **`model`**

  `string`, default: `"whisper-large-v3"` — The model to use. Options: \`whisper-large-v3\`, \`whisper-1\`, \`scribe\`, \`universal-2\`, \`universal-3-pro\`.

- **`prompt`**

  `string` — Optional text to guide the model's style or continue a previous segment.

- **`response_format`**

  `string`, possible values: `"json", "text", "srt", "verbose_json", "vtt"`, default: `"json"` — The format of the transcript output.

- **`temperature`**

  `number` — Sampling temperature between 0 and 1. Lower is more deterministic.

**Example:**

```json
{
  "model": "whisper-large-v3",
  "response_format": "json",
  "temperature": 1
}
```

#### Responses

##### Status: 200 Success - Returns transcription

###### Content-Type: application/json

- **`text`**

  `string`

**Example:**

### List Models (OpenAI-compatible)

- **Method:** `GET`
- **Path:** `/v1/models`
- **Tags:** 🤖 Models

Returns available models (text, image, audio) in the OpenAI-compatible format (`{object: "list", data: [...]}`). Use this endpoint if you're using an OpenAI SDK. For richer metadata including pricing and capabilities, use `/text/models`, `/image/models`, or `/audio/models` instead. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.

#### Responses

##### Status: 200 Success

###### Content-Type: application/json

- **`data` (required)**

  `array`

  **Items:**

  - **`created` (required)**

    `number`

  - **`id` (required)**

    `string`

  - **`object` (required)**

    `string`

  - **`context_length`**

    `number`

  - **`input_modalities`**

    `array`

    **Items:**

    `string`

  - **`output_modalities`**

    `array`

    **Items:**

    `string`

  - **`reasoning`**

    `boolean`

  - **`supported_endpoints`**

    `array`

    **Items:**

    `string`

  - **`tools`**

    `boolean`

- **`object` (required)**

  `string`

**Example:**

```json
{
  "object": "list",
  "data": [
    {
      "object": "model",
      "created": 1,
      "input_modalities": [
        ""
      ],
      "output_modalities": [
        ""
      ],
      "supported_endpoints": [
        ""
      ],
      "tools": true,
      "reasoning": true,
      "context_length": 1
    }
  ]
}
```

### List Text Models

- **Method:** `GET`
- **Path:** `/models`
- **Tags:** 🤖 Models

Convenience alias for `/text/models`. Returns all available text generation models with pricing, capabilities, and metadata.

#### Responses

##### Status: 200 Success

###### Content-Type: application/json

**Array of:**

**Example:**

### List Image & Video Models

- **Method:** `GET`
- **Path:** `/image/models`
- **Tags:** 🤖 Models

Returns all available image and video generation models with pricing, capabilities, and metadata. Video models are included here — check the `outputModalities` field to distinguish image vs video models. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.

#### Responses

##### Status: 200 Success

###### Content-Type: application/json

**Array of:**

**Example:**

### List Text Models (Detailed)

- **Method:** `GET`
- **Path:** `/text/models`
- **Tags:** 🤖 Models

Returns all available text generation models with pricing, capabilities, and metadata including context window size, supported modalities, and tool support. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.

#### Responses

##### Status: 200 Success

###### Content-Type: application/json

**Array of:**

**Example:**

### List Audio Models

- **Method:** `GET`
- **Path:** `/audio/models`
- **Tags:** 🤖 Models

Returns all available audio models (text-to-speech, music generation, and transcription) with pricing, capabilities, and metadata. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.

#### Responses

##### Status: 200 Success

###### Content-Type: application/json

**Array of:**

**Example:**

### Chat Completions

- **Method:** `POST`
- **Path:** `/v1/chat/completions`
- **Tags:** ✍️ Text Generation

Generate text responses using AI models. Fully compatible with the OpenAI Chat Completions API — use any OpenAI SDK by pointing it to `https://gen.pollinations.ai`.

Supports streaming, function calling, vision (image input), structured outputs, and reasoning/thinking modes depending on the model.

#### Request Body

##### Content-Type: application/json

- **`messages` (required)**

  `array`

  **Items:**

  **Any of:**

  - **`content` (required)**

    `object`

  - **`role` (required)**

    `string`

  - **`cache_control`**

    `object`

    - **`type` (required)**

      `string`, possible values: `"ephemeral"`

  - **`name`**

    `string`

  * **`content` (required)**

    `object`

  * **`role` (required)**

    `string`

  * **`cache_control`**

    `object`

    - **`type` (required)**

      `string`, possible values: `"ephemeral"`

  * **`name`**

    `string`

  - **`content` (required)**

    `object`

  - **`role` (required)**

    `string`

  - **`name`**

    `string`

  * **`role` (required)**

    `string`

  * **`cache_control`**

    `object`

    - **`type` (required)**

      `string`, possible values: `"ephemeral"`

  * **`content`**

    `object`

  * **`function_call`**

    `object`

  * **`name`**

    `string`

  * **`tool_calls`**

    `array`

    **Items:**

    - **`function` (required)**

      `object`

      - **`arguments` (required)**

        `string`

      - **`name` (required)**

        `string`

    - **`id` (required)**

      `string`

    - **`type` (required)**

      `string`

  - **`content` (required)**

    `object`

  - **`role` (required)**

    `string`

  - **`tool_call_id` (required)**

    `string`

  - **`cache_control`**

    `object`

    - **`type` (required)**

      `string`, possible values: `"ephemeral"`

  * **`content` (required)**

    `object`

  * **`name` (required)**

    `string`

  * **`role` (required)**

    `string`

- **`audio`**

  `object`

  - **`format` (required)**

    `string`, possible values: `"wav", "mp3", "flac", "opus", "pcm16"`

  - **`voice` (required)**

    `string`, possible values: `"alloy", "echo", "fable", "onyx", "nova", "shimmer", "coral", "verse", "ballad", "ash", "sage", "amuch", "dan"`

- **`frequency_penalty`**

  `object`, default: `0`

- **`function_call`**

  `object`

- **`functions`**

  `array`

  **Items:**

  - **`name` (required)**

    `string`

  - **`description`**

    `string`

  - **`parameters`**

    `object`

- **`logit_bias`**

  `object`, default: `null`

- **`logprobs`**

  `object`, default: `false`

- **`max_tokens`**

  `object`

- **`modalities`**

  `array`

  **Items:**

  `string`, possible values: `"text", "audio"`

- **`model`**

  `string`, default: `"openai"` — AI model for text generation. See /v1/models for full list.

- **`parallel_tool_calls`**

  `boolean`, default: `true`

- **`presence_penalty`**

  `object`, default: `0`

- **`reasoning_effort`**

  `string`, possible values: `"none", "minimal", "low", "medium", "high", "xhigh"`

- **`repetition_penalty`**

  `object`

- **`response_format`**

  `object`

- **`safe`**

  `object` — Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off.

- **`seed`**

  `object`

- **`stop`**

  `object`

- **`stream`**

  `object`, default: `false`

- **`stream_options`**

  `object`

- **`temperature`**

  `object`

- **`thinking`**

  `object`

- **`thinking_budget`**

  `integer`

- **`tool_choice`**

  `object`

- **`tools`**

  `array`

  **Items:**

  **Any of:**

  - **`function` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`description`**

      `string`

    - **`parameters`**

      `object`

    - **`strict`**

      `object`, default: `false`

  - **`type` (required)**

    `string`

  * **`type` (required)**

    `string`, possible values: `"code_execution", "google_search", "google_maps", "url_context", "computer_use", "file_search"`

- **`top_logprobs`**

  `object`

- **`top_p`**

  `object`

- **`user`**

  `string`

**Example:**

```json
{
  "messages": [
    {
      "role": "system",
      "cache_control": {
        "type": "ephemeral"
      }
    }
  ],
  "model": "openai",
  "modalities": [
    "text"
  ],
  "audio": {
    "voice": "alloy",
    "format": "wav"
  },
  "frequency_penalty": 0,
  "repetition_penalty": 0,
  "logprobs": false,
  "top_logprobs": 0,
  "max_tokens": 0,
  "presence_penalty": 0,
  "response_format": {
    "type": "text"
  },
  "seed": -1,
  "stream": false,
  "stream_options": {
    "include_usage": true
  },
  "thinking": {
    "type": "disabled",
    "budget_tokens": 1
  },
  "reasoning_effort": "none",
  "thinking_budget": 0,
  "temperature": 0,
  "top_p": 0,
  "tools": [
    {
      "type": "function",
      "function": {
        "parameters": {
          "propertyName*": "anything"
        },
        "strict": false
      }
    }
  ],
  "tool_choice": "none",
  "parallel_tool_calls": true,
  "function_call": "none",
  "functions": [
    {
      "parameters": {
        "propertyName*": "anything"
      }
    }
  ],
  "propertyName*": "anything"
}
```

#### Responses

##### Status: 200 Success

###### Content-Type: application/json

- **`choices` (required)**

  `array`

  **Items:**

  - **`content_filter_results`**

    `object`

  - **`finish_reason`**

    `object`

  - **`index`**

    `integer`

  - **`logprobs`**

    `object`

  - **`message`**

    `object`

    - **`role` (required)**

      `string`

    - **`audio`**

      `object`

    - **`content`**

      `object`

    - **`content_blocks`**

      `object`

    - **`function_call`**

      `object`

    - **`reasoning_content`**

      `object`

    - **`tool_calls`**

      `object`

- **`created` (required)**

  `integer`

- **`id` (required)**

  `string`

- **`model` (required)**

  `string`

- **`object` (required)**

  `string`

- **`citations`**

  `array`

  **Items:**

  `string`

- **`prompt_filter_results`**

  `object`

- **`system_fingerprint`**

  `object`

- **`usage`**

  `object`

  - **`completion_tokens` (required)**

    `integer`

  - **`prompt_tokens` (required)**

    `integer`

  - **`total_tokens` (required)**

    `integer`

  - **`completion_tokens_details`**

    `object`

  - **`prompt_tokens_details`**

    `object`

- **`user_tier`**

  `string`, possible values: `"anonymous", "seed", "flower", "nectar"`

**Example:**

```json
{
  "choices": [
    {
      "index": 0,
      "message": {
        "tool_calls": [
          {
            "type": "function"
          }
        ],
        "role": "assistant",
        "content_blocks": [
          {
            "type": "text",
            "cache_control": {
              "type": "ephemeral"
            }
          }
        ],
        "audio": {
          "expires_at": -9007199254740991
        }
      },
      "logprobs": {
        "content": [
          {
            "logprob": 1,
            "bytes": [
              "[Max Depth Exceeded]"
            ],
            "top_logprobs": [
              {
                "token": "[Max Depth Exceeded]",
                "logprob": "[Max Depth Exceeded]",
                "bytes": "[Max Depth Exceeded]"
              }
            ]
          }
        ]
      },
      "content_filter_results": {
        "hate": {
          "filtered": true,
          "severity": "safe"
        },
        "self_harm": {
          "filtered": true,
          "severity": "safe"
        },
        "sexual": {
          "filtered": true,
          "severity": "safe"
        },
        "violence": {
          "filtered": true,
          "severity": "safe"
        },
        "jailbreak": {
          "filtered": true,
          "detected": true
        },
        "protected_material_text": {
          "filtered": true,
          "detected": true
        },
        "protected_material_code": {
          "filtered": true,
          "detected": true
        }
      }
    }
  ],
  "prompt_filter_results": [
    {
      "prompt_index": 0,
      "content_filter_results": {
        "hate": {
          "filtered": true,
          "severity": "safe"
        },
        "self_harm": {
          "filtered": true,
          "severity": "safe"
        },
        "sexual": {
          "filtered": true,
          "severity": "safe"
        },
        "violence": {
          "filtered": true,
          "severity": "safe"
        },
        "jailbreak": {
          "filtered": true,
          "detected": true
        },
        "protected_material_text": {
          "filtered": true,
          "detected": true
        },
        "protected_material_code": {
          "filtered": true,
          "detected": true
        }
      }
    }
  ],
  "created": -9007199254740991,
  "object": "chat.completion",
  "usage": {
    "completion_tokens": 0,
    "completion_tokens_details": {
      "accepted_prediction_tokens": 0,
      "audio_tokens": 0,
      "reasoning_tokens": 0,
      "rejected_prediction_tokens": 0
    },
    "prompt_tokens": 0,
    "prompt_tokens_details": {
      "audio_tokens": 0,
      "cached_tokens": 0
    },
    "total_tokens": 0
  },
  "user_tier": "anonymous",
  "citations": [
    ""
  ]
}
```

### Text Generation With Messages

- **Method:** `POST`
- **Path:** `/text`
- **Tags:** ✍️ Text Generation

Generate text from an OpenAI-style messages array and return the assistant content directly.

Use `/v1/chat/completions` when you need the full OpenAI-compatible JSON response.

#### Request Body

##### Content-Type: application/json

- **`messages` (required)**

  `array`

  **Items:**

  **Any of:**

  - **`content` (required)**

    `object`

  - **`role` (required)**

    `string`

  - **`cache_control`**

    `object`

    - **`type` (required)**

      `string`, possible values: `"ephemeral"`

  - **`name`**

    `string`

  * **`content` (required)**

    `object`

  * **`role` (required)**

    `string`

  * **`cache_control`**

    `object`

    - **`type` (required)**

      `string`, possible values: `"ephemeral"`

  * **`name`**

    `string`

  - **`content` (required)**

    `object`

  - **`role` (required)**

    `string`

  - **`name`**

    `string`

  * **`role` (required)**

    `string`

  * **`cache_control`**

    `object`

    - **`type` (required)**

      `string`, possible values: `"ephemeral"`

  * **`content`**

    `object`

  * **`function_call`**

    `object`

  * **`name`**

    `string`

  * **`tool_calls`**

    `array`

    **Items:**

    - **`function` (required)**

      `object`

      - **`arguments` (required)**

        `string`

      - **`name` (required)**

        `string`

    - **`id` (required)**

      `string`

    - **`type` (required)**

      `string`

  - **`content` (required)**

    `object`

  - **`role` (required)**

    `string`

  - **`tool_call_id` (required)**

    `string`

  - **`cache_control`**

    `object`

    - **`type` (required)**

      `string`, possible values: `"ephemeral"`

  * **`content` (required)**

    `object`

  * **`name` (required)**

    `string`

  * **`role` (required)**

    `string`

- **`audio`**

  `object`

  - **`format` (required)**

    `string`, possible values: `"wav", "mp3", "flac", "opus", "pcm16"`

  - **`voice` (required)**

    `string`, possible values: `"alloy", "echo", "fable", "onyx", "nova", "shimmer", "coral", "verse", "ballad", "ash", "sage", "amuch", "dan"`

- **`frequency_penalty`**

  `object`, default: `0`

- **`function_call`**

  `object`

- **`functions`**

  `array`

  **Items:**

  - **`name` (required)**

    `string`

  - **`description`**

    `string`

  - **`parameters`**

    `object`

- **`logit_bias`**

  `object`, default: `null`

- **`logprobs`**

  `object`, default: `false`

- **`max_tokens`**

  `object`

- **`modalities`**

  `array`

  **Items:**

  `string`, possible values: `"text", "audio"`

- **`model`**

  `string`, default: `"openai"` — AI model for text generation. See /v1/models for full list.

- **`parallel_tool_calls`**

  `boolean`, default: `true`

- **`presence_penalty`**

  `object`, default: `0`

- **`reasoning_effort`**

  `string`, possible values: `"none", "minimal", "low", "medium", "high", "xhigh"`

- **`repetition_penalty`**

  `object`

- **`response_format`**

  `object`

- **`safe`**

  `object` — Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off.

- **`seed`**

  `object`

- **`stop`**

  `object`

- **`stream`**

  `object`, default: `false`

- **`stream_options`**

  `object`

- **`temperature`**

  `object`

- **`thinking`**

  `object`

- **`thinking_budget`**

  `integer`

- **`tool_choice`**

  `object`

- **`tools`**

  `array`

  **Items:**

  **Any of:**

  - **`function` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`description`**

      `string`

    - **`parameters`**

      `object`

    - **`strict`**

      `object`, default: `false`

  - **`type` (required)**

    `string`

  * **`type` (required)**

    `string`, possible values: `"code_execution", "google_search", "google_maps", "url_context", "computer_use", "file_search"`

- **`top_logprobs`**

  `object`

- **`top_p`**

  `object`

- **`user`**

  `string`

**Example:**

```json
{
  "messages": [
    {
      "role": "system",
      "cache_control": {
        "type": "ephemeral"
      }
    }
  ],
  "model": "openai",
  "modalities": [
    "text"
  ],
  "audio": {
    "voice": "alloy",
    "format": "wav"
  },
  "frequency_penalty": 0,
  "repetition_penalty": 0,
  "logprobs": false,
  "top_logprobs": 0,
  "max_tokens": 0,
  "presence_penalty": 0,
  "response_format": {
    "type": "text"
  },
  "seed": -1,
  "stream": false,
  "stream_options": {
    "include_usage": true
  },
  "thinking": {
    "type": "disabled",
    "budget_tokens": 1
  },
  "reasoning_effort": "none",
  "thinking_budget": 0,
  "temperature": 0,
  "top_p": 0,
  "tools": [
    {
      "type": "function",
      "function": {
        "parameters": {
          "propertyName*": "anything"
        },
        "strict": false
      }
    }
  ],
  "tool_choice": "none",
  "parallel_tool_calls": true,
  "function_call": "none",
  "functions": [
    {
      "parameters": {
        "propertyName*": "anything"
      }
    }
  ],
  "propertyName*": "anything"
}
```

#### Responses

##### Status: 200 Generated text response, audio bytes, JSON message object, or SSE when stream=true

### Simple Text Generation

- **Method:** `GET`
- **Path:** `/text/{prompt}`
- **Tags:** ✍️ Text Generation

Generate text from a prompt via a simple GET request. Returns plain text.

This is a simplified alternative to the OpenAI-compatible `/v1/chat/completions` endpoint — ideal for quick prototyping or simple integrations.

#### Responses

##### Status: 200 Generated text response

###### Content-Type: text/plain

`string`

**Example:**

```json
true
```

### Generate Image

- **Method:** `GET`
- **Path:** `/image/{prompt}`
- **Tags:** 🖼️ Image Generation

Generate an image from a text prompt. Returns JPEG or PNG.

**Available models:** `kontext`, `nanobanana`, `nanobanana-2`, `nanobanana-pro`, `seedream5`, `seedream`, `seedream-pro`, `gptimage`, `gptimage-large`, `gpt-image-2`, `flux`, `zimage`, `wan-image`, `wan-image-pro`, `qwen-image`, `grok-imagine`, `grok-imagine-pro`, `klein`, `p-image`, `p-image-edit`, `nova-canvas`. `zimage` is the default.

Browse all available models and their capabilities at [`/image/models`](https://gen.pollinations.ai/image/models).

#### Responses

##### Status: 200 Success - Returns the generated image

###### Content-Type: image/jpeg

`string`, format: `binary`

**Example:**

###### Content-Type: image/png

`string`, format: `binary`

**Example:**

### Generate Video

- **Method:** `GET`
- **Path:** `/video/{prompt}`
- **Tags:** 🎬 Video Generation

Generate a video from a text prompt. Returns MP4.

**Available models:** `veo`, `seedance`, `seedance-pro`, `wan`, `wan-fast`, `grok-video-pro`, `ltx-2`, `p-video`, `nova-reel`.

Use `duration` to set video length, `aspectRatio` for orientation, and `audio` to enable soundtrack generation.

You can also pass reference images via the `image` parameter — for example, `veo` supports start and end frames for interpolation.

Browse all available models at [`/image/models`](https://gen.pollinations.ai/image/models).

#### Responses

##### Status: 200 Success - Returns the generated video

###### Content-Type: video/mp4

`string`, format: `binary`

**Example:**

### Generate Audio

- **Method:** `GET`
- **Path:** `/audio/{text}`
- **Tags:** 🔊 Audio Generation

Generate speech or music from text via a simple GET request.

**Text-to-speech (default):** Returns spoken audio in the selected voice and format.

**Available voices:** alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, matilda, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill

**Output formats:** mp3 (default), opus, aac, flac, wav, pcm

**Music generation:** Set `model=elevenmusic` to generate music instead of speech. Supports `duration` (3-300 seconds) and `instrumental` mode.

#### Responses

##### Status: 200 Success - Returns audio data

###### Content-Type: audio/mpeg

`string`, format: `binary`

**Example:**

### Generate Image (OpenAI-compatible)

- **Method:** `POST`
- **Path:** `/v1/images/generations`
- **Tags:** 🖼️ Image Generation

OpenAI-compatible image generation endpoint.

Generate images from text prompts. Supports `response_format: "url"` (returns a pollinations.ai URL) or `"b64_json"` (returns base64-encoded image data, default).

**Authentication:** Include your API key as `Authorization: Bearer YOUR_API_KEY`.

#### Request Body

##### Content-Type: application/json

- **`prompt` (required)**

  `string` — A text description of the desired image(s)

- **`image`**

  `object` — Reference image URL(s) for image-to-image generation (Pollinations extension)

- **`model`**

  `string`, default: `"flux"` — The model to use for image generation

- **`n`**

  `integer`, default: `1` — Number of images to generate (currently max 1)

- **`quality`**

  `string`, possible values: `"standard", "hd", "low", "medium", "high"`, default: `"medium"` — Image quality. OpenAI 'standard'/'hd' mapped to Pollinations equivalents

- **`response_format`**

  `string`, possible values: `"url", "b64_json"`, default: `"b64_json"` — Return format. "url" returns a pollinations.ai URL, "b64\_json" returns base64-encoded image data

- **`safe`**

  `object` — Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off.

- **`size`**

  `string`, default: `"1024x1024"` — Image size as WIDTHxHEIGHT (e.g., 1024x1024, 512x512)

- **`user`**

  `string` — End-user identifier for abuse tracking

**Example:**

```json
{
  "model": "flux",
  "n": 1,
  "size": "1024x1024",
  "quality": "medium",
  "response_format": "b64_json",
  "propertyName*": "anything"
}
```

#### Responses

##### Status: 200 Success

###### Content-Type: application/json

- **`created` (required)**

  `integer`

- **`data` (required)**

  `array`

  **Items:**

  - **`b64_json`**

    `string`

  - **`revised_prompt`**

    `string`

  - **`url`**

    `string`

**Example:**

```json
{
  "created": -9007199254740991
}
```

### Edit Image (OpenAI-compatible)

- **Method:** `POST`
- **Path:** `/v1/images/edits`
- **Tags:** 🖼️ Image Generation

OpenAI-compatible image editing endpoint.

Edit images using a text prompt and one or more source images. Accepts JSON with image URLs or multipart/form-data with file uploads.

**Authentication:** Include your API key as `Authorization: Bearer YOUR_API_KEY`.

#### Responses

##### Status: 200 Success

###### Content-Type: application/json

- **`created` (required)**

  `integer`

- **`data` (required)**

  `array`

  **Items:**

  - **`b64_json`**

    `string`

  - **`revised_prompt`**

    `string`

  - **`url`**

    `string`

**Example:**

```json
{
  "created": -9007199254740991
}
```

### Upload media

- **Method:** `POST`
- **Path:** `/upload`
- **Tags:** 📦 Media Storage

Upload an image, audio, or video file. Supports multipart/form-data, raw binary, or base64 JSON. Returns a content-addressed hash URL. The hash includes the filename, so the same content with different filenames gets different URLs. Re-uploading resets the 14-day TTL.

#### Responses

##### Status: 200 Upload successful

###### Content-Type: application/json

- **`contentType` (required)**

  `string`

- **`duplicate` (required)**

  `boolean`

- **`id` (required)**

  `string`

- **`size` (required)**

  `integer`

- **`url` (required)**

  `string`

**Example:**

```json
{
  "size": 1,
  "duplicate": true
}
```

### SERVERS /upload

- **Method:** `SERVERS`
- **Path:** `/upload`

### Retrieve media

- **Method:** `GET`
- **Path:** `/{hash}`
- **Tags:** 📦 Media Storage

Get a file by its content hash. No authentication required. Responses are cached immutably.

#### Responses

##### Status: 200 File content with appropriate Content-Type

### Check if media exists

- **Method:** `HEAD`
- **Path:** `/{hash}`
- **Tags:** 📦 Media Storage

Check existence and metadata without downloading the file.

#### Responses

##### Status: 200 File exists (headers include Content-Type, Content-Length, X-Content-Hash)

### SERVERS /{hash}

- **Method:** `SERVERS`
- **Path:** `/{hash}`

### Get file metadata

- **Method:** `GET`
- **Path:** `/{hash}/metadata`
- **Tags:** 📦 Media Storage

Return file metadata (hash, content type, size, upload timestamp) as JSON without downloading the file body.

#### Responses

##### Status: 200 File metadata

###### Content-Type: application/json

- **`contentType` (required)**

  `string`

- **`hash` (required)**

  `string`

- **`size` (required)**

  `integer`

- **`uploadedAt`**

  `string`

**Example:**

```json
{
  "size": 1
}
```

### SERVERS /{hash}/metadata

- **Method:** `SERVERS`
- **Path:** `/{hash}/metadata`

## Schemas

### ErrorDetails

- **Type:**`object`

* **`name` (required)**

  `string`

* **`upstreamBody`**

  `string`

* **`upstreamHost`**

  `string`

* **`upstreamStatus`**

  `integer`

**Example:**

```json
{
  "upstreamStatus": -9007199254740991
}
```

### ValidationErrorDetails

- **Type:**`object`

* **`fieldErrors` (required)**

  `object`

* **`formErrors` (required)**

  `array`

  **Items:**

  `string`

* **`name` (required)**

  `string`

**Example:**

```json
{
  "formErrors": [
    ""
  ],
  "fieldErrors": {
    "propertyName*": [
      ""
    ]
  }
}
```

### CreateSpeechRequest

- **Type:**`object`

* **`input` (required)**

  `string` — The text to generate audio for. Maximum 4096 characters.

* **`duration`**

  `number` — Music duration in seconds, 3-300 (elevenmusic/acestep)

* **`instruct`**

  `string` — Emotion/style instruction (qwen-tts-instruct only). e.g. 'excited and cheerful'.

* **`instrumental`**

  `boolean` — If true, guarantees instrumental output (elevenmusic only)

* **`model`**

  `string`

* **`response_format`**

  `string`, possible values: `"mp3", "opus", "aac", "flac", "wav", "pcm"`, default: `"mp3"` — The audio format for the output. Qwen TTS currently returns WAV regardless of this setting.

* **`safe`**

  `object` — Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off.

* **`seed`**

  `integer` — Seed for deterministic output. Same seed + params = best-effort return of the same cached result. Omit for random.

* **`speed`**

  `number`, default: `1` — The speed of the generated audio. 0.25 to 4.0, default 1.0.

* **`style`**

  `string` — Style/genre tags for music generation (acestep only). If omitted, style is auto-detected from the input text.

* **`voice`**

  `string`, default: `"alloy"` — The voice to use. Can be any preset name (alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, matilda, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill) OR a custom ElevenLabs voice ID (UUID from your dashboard).

**Example:**

```json
{
  "input": "Hello, welcome to Pollinations!",
  "voice": "rachel",
  "response_format": "mp3",
  "speed": 1,
  "duration": 30,
  "instrumental": false,
  "seed": 42,
  "style": "brazilian berimbau instrumental",
  "instruct": "speak softly and warmly"
}
```

### CacheControl

- **Type:**`object`

* **`type` (required)**

  `string`, possible values: `"ephemeral"`

**Example:**

```json
{
  "type": "ephemeral"
}
```

### ContentFilterSeverity

- **Type:**`string`

**Example:**

### ContentFilterResult

- **Type:**`object`

* **`hate`**

  `object`

  - **`filtered` (required)**

    `boolean`

  - **`severity` (required)**

    `string`, possible values: `"safe", "low", "medium", "high"`

* **`jailbreak`**

  `object`

  - **`detected` (required)**

    `boolean`

  - **`filtered` (required)**

    `boolean`

* **`protected_material_code`**

  `object`

  - **`detected` (required)**

    `boolean`

  - **`filtered` (required)**

    `boolean`

* **`protected_material_text`**

  `object`

  - **`detected` (required)**

    `boolean`

  - **`filtered` (required)**

    `boolean`

* **`self_harm`**

  `object`

  - **`filtered` (required)**

    `boolean`

  - **`severity` (required)**

    `string`, possible values: `"safe", "low", "medium", "high"`

* **`sexual`**

  `object`

  - **`filtered` (required)**

    `boolean`

  - **`severity` (required)**

    `string`, possible values: `"safe", "low", "medium", "high"`

* **`violence`**

  `object`

  - **`filtered` (required)**

    `boolean`

  - **`severity` (required)**

    `string`, possible values: `"safe", "low", "medium", "high"`

**Example:**

```json
{
  "hate": {
    "filtered": true,
    "severity": "safe"
  },
  "self_harm": {
    "filtered": true,
    "severity": "safe"
  },
  "sexual": {
    "filtered": true,
    "severity": "safe"
  },
  "violence": {
    "filtered": true,
    "severity": "safe"
  },
  "jailbreak": {
    "filtered": true,
    "detected": true
  },
  "protected_material_text": {
    "filtered": true,
    "detected": true
  },
  "protected_material_code": {
    "filtered": true,
    "detected": true
  }
}
```

### CompletionUsage

- **Type:**`object`

* **`completion_tokens` (required)**

  `integer`

* **`prompt_tokens` (required)**

  `integer`

* **`total_tokens` (required)**

  `integer`

* **`completion_tokens_details`**

  `object`

* **`prompt_tokens_details`**

  `object`

**Example:**

```json
{
  "completion_tokens": 0,
  "completion_tokens_details": {
    "accepted_prediction_tokens": 0,
    "audio_tokens": 0,
    "reasoning_tokens": 0,
    "rejected_prediction_tokens": 0
  },
  "prompt_tokens": 0,
  "prompt_tokens_details": {
    "audio_tokens": 0,
    "cached_tokens": 0
  },
  "total_tokens": 0
}
```

### MessageContentPart

- **Type:**

**Example:**

### CreateImageResponse

- **Type:**`object`

* **`created` (required)**

  `integer`

* **`data` (required)**

  `array`

  **Items:**

  - **`b64_json`**

    `string`

  - **`revised_prompt`**

    `string`

  - **`url`**

    `string`

**Example:**

```json
{
  "created": -9007199254740991
}
```

### CreateImageRequest

- **Type:**`object`

* **`prompt` (required)**

  `string` — A text description of the desired image(s)

* **`image`**

  `object` — Reference image URL(s) for image-to-image generation (Pollinations extension)

* **`model`**

  `string`, default: `"flux"` — The model to use for image generation

* **`n`**

  `integer`, default: `1` — Number of images to generate (currently max 1)

* **`quality`**

  `string`, possible values: `"standard", "hd", "low", "medium", "high"`, default: `"medium"` — Image quality. OpenAI 'standard'/'hd' mapped to Pollinations equivalents

* **`response_format`**

  `string`, possible values: `"url", "b64_json"`, default: `"b64_json"` — Return format. "url" returns a pollinations.ai URL, "b64\_json" returns base64-encoded image data

* **`safe`**

  `object` — Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off.

* **`size`**

  `string`, default: `"1024x1024"` — Image size as WIDTHxHEIGHT (e.g., 1024x1024, 512x512)

* **`user`**

  `string` — End-user identifier for abuse tracking

**Example:**

```json
{
  "model": "flux",
  "n": 1,
  "size": "1024x1024",
  "quality": "medium",
  "response_format": "b64_json",
  "propertyName*": "anything"
}
```

## Error Responses

All endpoints return errors in this format:

```json
{
  "status": 400,
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Description of what went wrong",
    "timestamp": "2025-01-01T00:00:00.000Z",
    "details": {
      "name": "ValidationError"
    },
    "requestId": "req_abc123"
  }
}
```

| Status | Code | Description |
|--------|------|-------------|
| 400 | BAD_REQUEST | Invalid input data. `details` includes `formErrors` and `fieldErrors` for validation failures. |
| 401 | UNAUTHORIZED | Missing or invalid API key. Provide via `Authorization: Bearer <key>` header or `?key=<key>` query param. |
| 402 | PAYMENT_REQUIRED | Insufficient pollen balance or API key budget exhausted. |
| 403 | FORBIDDEN | Access denied — insufficient permissions or tier for this model. |
| 404 | NOT_FOUND | Resource not found. |
| 429 | RATE_LIMITED | Too many requests. Slow down. |
| 500 | INTERNAL_ERROR | Server error. We're on it. |
