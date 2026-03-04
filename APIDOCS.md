# Pollinations API

- **OpenAPI Version:** `3.1.0`
- **API Version:** `0.3.0`

## Introduction

Generate text, images, video, and audio with a single API. OpenAI-compatible — use any OpenAI SDK by changing the base URL.

**Base URL:** `https://gen.pollinations.ai`

**Get your API key:** [enter.pollinations.ai](https://enter.pollinations.ai)

## Overview

| Capability | Endpoint             | Format                          |                   |
| ---------- | -------------------- | ------------------------------- | ----------------- |
| ✍️         | **Text Generation**  | `POST /v1/chat/completions`     | OpenAI-compatible |
| ✍️         | **Simple Text**      | `GET /text/{prompt}`            | Plain text        |
| 🖼️        | **Image Generation** | `GET /image/{prompt}`           | JPEG / PNG        |
| 🎬         | **Video Generation** | `GET /video/{prompt}`           | MP4               |
| 🔊         | **Text-to-Speech**   | `GET /audio/{text}`             | MP3               |
| 🔊         | **Music Generation** | `GET /audio/{text}`             | MP3               |
| 🔊         | **Transcription**    | `POST /v1/audio/transcriptions` | JSON              |
| 🤖         | **Model Discovery**  | `GET /v1/models`                | JSON              |

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

## ❌ Errors

All errors return JSON with a consistent format:

```json
{
  "status": 400,
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Description of what went wrong"
  }
}
```

| Status | Meaning                                 |
| ------ | --------------------------------------- |
| `400`  | Invalid parameters or malformed request |
| `401`  | Missing or invalid API key              |
| `402`  | Insufficient pollen balance             |
| `403`  | API key lacks required permission       |
| `500`  | Internal server error                   |

## Servers

- **URL:** `https://gen.pollinations.ai`

## Operations

### Get Profile

- **Method:** `GET`
- **Path:** `/account/profile`
- **Tags:** 👤 Account

Returns your account profile including name, email, tier level, and account creation date. Requires `account:profile` permission when using API keys.

#### Responses

##### Status: 200 User profile

###### Content-Type: application/json

- **`createdAt` (required)**

  `string`, format: `date-time` — Account creation timestamp (ISO 8601)

- **`email` (required)**

  `object` — User's email address

- **`githubUsername` (required)**

  `object` — GitHub username if linked

- **`image` (required)**

  `object` — Profile picture URL (e.g. GitHub avatar)

- **`name` (required)**

  `object` — User's display name

- **`nextResetAt` (required)**

  `object` — Next daily pollen reset timestamp (ISO 8601)

- **`tier` (required)**

  `string`, possible values: `"anonymous", "microbe", "spore", "seed", "flower", "nectar", "router"` — User's current tier level

**Example:**

```json
{
  "name": "",
  "email": "",
  "githubUsername": "",
  "image": "",
  "tier": "anonymous",
  "createdAt": "",
  "nextResetAt": ""
}
```

##### Status: 401 Unauthorized

##### Status: 403 Permission denied - API key missing \`account:profile\` permission

### Get Balance

- **Method:** `GET`
- **Path:** `/account/balance`
- **Tags:** 👤 Account

Returns your current pollen balance. If the API key has a budget limit, returns the key's remaining budget instead. Requires `account:balance` permission when using API keys.

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

##### Status: 401 Unauthorized

##### Status: 403 Permission denied - API key missing \`account:balance\` permission

### Get Usage History

- **Method:** `GET`
- **Path:** `/account/usage`
- **Tags:** 👤 Account

Returns your request history with per-request details: model used, token counts, cost, and response time. Supports JSON and CSV export. Use `before` for cursor-based pagination. Requires `account:usage` permission when using API keys.

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
      "timestamp": "",
      "type": "",
      "model": "",
      "api_key": "",
      "api_key_type": "",
      "meter_source": "",
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

##### Status: 401 Unauthorized

##### Status: 403 Permission denied - API key missing \`account:usage\` permission

### Get Daily Usage

- **Method:** `GET`
- **Path:** `/account/usage/daily`
- **Tags:** 👤 Account

Returns daily aggregated usage for the last 90 days, grouped by date and model. Useful for dashboards and spending analysis. Supports JSON and CSV export. Results are cached for 1 hour. Requires `account:usage` permission when using API keys.

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
      "date": "",
      "model": "",
      "meter_source": "",
      "requests": 1,
      "cost_usd": 1
    }
  ],
  "count": 1
}
```

##### Status: 401 Unauthorized

##### Status: 403 Permission denied - API key missing \`account:usage\` permission

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
  "name": "",
  "expiresAt": "",
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

##### Status: 401 Invalid or missing API key

### List Text Models (OpenAI-compatible)

- **Method:** `GET`
- **Path:** `/v1/models`
- **Tags:** 🤖 Models

Returns available text models in the OpenAI-compatible format (`{object: "list", data: [...]}`). Use this endpoint if you're using an OpenAI SDK. For richer metadata including pricing and capabilities, use `/text/models` instead. When authenticated: models are filtered by API key permissions, and `paid_only` models are hidden if the account has no paid balance.

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

- **`object` (required)**

  `string`

**Example:**

```json
{
  "object": "list",
  "data": [
    {
      "id": "",
      "object": "model",
      "created": 1
    }
  ]
}
```

##### Status: 500 Oh snap, something went wrong on our end. We're on it!

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 500,
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Oh snap, something went wrong on our end. We're on it!",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

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

```json
[]
```

##### Status: 500 Oh snap, something went wrong on our end. We're on it!

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 500,
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Oh snap, something went wrong on our end. We're on it!",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

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

```json
[]
```

##### Status: 500 Oh snap, something went wrong on our end. We're on it!

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 500,
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Oh snap, something went wrong on our end. We're on it!",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

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

```json
[]
```

##### Status: 500 Oh snap, something went wrong on our end. We're on it!

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 500,
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Oh snap, something went wrong on our end. We're on it!",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

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

    `string`, possible values: `"alloy", "echo", "fable", "onyx", "shimmer", "coral", "verse", "ballad", "ash", "sage", "amuch", "dan"`

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

- **`seed`**

  `object`

- **`stop`**

  `object`

- **`stream`**

  `object`, default: `false`

- **`stream_options`**

  `object`

- **`temperature`**

  `object`, default: `1`

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

  `object`, default: `1`

- **`user`**

  `string`

**Example:**

```json
{
  "messages": [
    {
      "content": "",
      "role": "system",
      "name": "",
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
  "logit_bias": null,
  "logprobs": false,
  "top_logprobs": 0,
  "max_tokens": 0,
  "presence_penalty": 0,
  "response_format": {
    "type": "text"
  },
  "seed": -1,
  "stop": "",
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
  "temperature": 1,
  "top_p": 1,
  "tools": [
    {
      "type": "function",
      "function": {
        "description": "",
        "name": "",
        "parameters": {
          "propertyName*": "anything"
        },
        "strict": false
      }
    }
  ],
  "tool_choice": "none",
  "parallel_tool_calls": true,
  "user": "",
  "function_call": "none",
  "functions": [
    {
      "description": "",
      "name": "",
      "parameters": {
        "propertyName*": "anything"
      }
    }
  ]
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
  "id": "",
  "choices": [
    {
      "finish_reason": "",
      "index": 0,
      "message": {
        "content": "",
        "tool_calls": [
          {
            "id": "",
            "type": "function",
            "function": {
              "name": "",
              "arguments": ""
            }
          }
        ],
        "role": "assistant",
        "function_call": {
          "arguments": "",
          "name": ""
        },
        "content_blocks": [
          {
            "type": "text",
            "text": "",
            "cache_control": {
              "type": "ephemeral"
            }
          }
        ],
        "audio": {
          "transcript": "",
          "data": "",
          "id": "",
          "expires_at": -9007199254740991
        },
        "reasoning_content": ""
      },
      "logprobs": {
        "content": [
          {
            "token": "",
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
  "model": "",
  "system_fingerprint": "",
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

##### Status: 400 Something was wrong with the input data, check the details for more info.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`fieldErrors` (required)**

      `object`

    - **`formErrors` (required)**

      `array`

      **Items:**

      `string`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 400,
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Something was wrong with the input data, check the details for more info.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": "",
      "formErrors": [
        ""
      ],
      "fieldErrors": {
        "propertyName*": [
          ""
        ]
      }
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 401 Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 401,
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 402 Insufficient pollen balance or API key budget exhausted.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 402,
  "success": false,
  "error": {
    "code": "PAYMENT_REQUIRED",
    "message": "Insufficient pollen balance or API key budget exhausted.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 403 Access denied! You don't have the required permissions for this resource or model.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 403,
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied! You don't have the required permissions for this resource or model.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 429 You're making requests too quickly. Please slow down a bit.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 429,
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "You're making requests too quickly. Please slow down a bit.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 500 Oh snap, something went wrong on our end. We're on it!

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 500,
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Oh snap, something went wrong on our end. We're on it!",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

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

##### Status: 400 Something was wrong with the input data, check the details for more info.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`fieldErrors` (required)**

      `object`

    - **`formErrors` (required)**

      `array`

      **Items:**

      `string`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 400,
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Something was wrong with the input data, check the details for more info.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": "",
      "formErrors": [
        ""
      ],
      "fieldErrors": {
        "propertyName*": [
          ""
        ]
      }
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 401 Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 401,
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 402 Insufficient pollen balance or API key budget exhausted.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 402,
  "success": false,
  "error": {
    "code": "PAYMENT_REQUIRED",
    "message": "Insufficient pollen balance or API key budget exhausted.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 403 Access denied! You don't have the required permissions for this resource or model.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 403,
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied! You don't have the required permissions for this resource or model.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 429 You're making requests too quickly. Please slow down a bit.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 429,
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "You're making requests too quickly. Please slow down a bit.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 500 Oh snap, something went wrong on our end. We're on it!

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 500,
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Oh snap, something went wrong on our end. We're on it!",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

### Generate Image

- **Method:** `GET`
- **Path:** `/image/{prompt}`
- **Tags:** 🖼️ Image Generation

Generate an image from a text prompt. Returns JPEG or PNG.

**Available models:** `kontext`, `nanobanana`, `nanobanana-2`, `nanobanana-pro`, `seedream5`, `seedream`, `seedream-pro`, `gptimage`, `gptimage-large`, `flux`, `zimage`, `klein`, `klein-large`, `imagen-4`, `flux-2-dev`, `grok-imagine`. `zimage` is the default.

Browse all available models and their capabilities at [`/image/models`](https://gen.pollinations.ai/image/models).

#### Responses

##### Status: 200 Success - Returns the generated image

###### Content-Type: image/jpeg

`string`, format: `binary`

**Example:**

```json
{}
```

###### Content-Type: image/png

`string`, format: `binary`

**Example:**

```json
{}
```

##### Status: 400 Something was wrong with the input data, check the details for more info.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`fieldErrors` (required)**

      `object`

    - **`formErrors` (required)**

      `array`

      **Items:**

      `string`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 400,
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Something was wrong with the input data, check the details for more info.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": "",
      "formErrors": [
        ""
      ],
      "fieldErrors": {
        "propertyName*": [
          ""
        ]
      }
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 401 Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 401,
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 402 Insufficient pollen balance or API key budget exhausted.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 402,
  "success": false,
  "error": {
    "code": "PAYMENT_REQUIRED",
    "message": "Insufficient pollen balance or API key budget exhausted.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 403 Access denied! You don't have the required permissions for this resource or model.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 403,
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied! You don't have the required permissions for this resource or model.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 429 You're making requests too quickly. Please slow down a bit.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 429,
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "You're making requests too quickly. Please slow down a bit.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 500 Oh snap, something went wrong on our end. We're on it!

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 500,
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Oh snap, something went wrong on our end. We're on it!",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

### Generate Video

- **Method:** `GET`
- **Path:** `/video/{prompt}`
- **Tags:** 🎬 Video Generation

Generate a video from a text prompt. Returns MP4.

**Available models:** `veo`, `seedance`, `seedance-pro`, `wan`, `grok-video`, `ltx-2`.

Use `duration` to set video length, `aspectRatio` for orientation, and `audio` to enable soundtrack generation.

You can also pass reference images via the `image` parameter — for example, `veo` supports start and end frames for interpolation.

Browse all available models at [`/image/models`](https://gen.pollinations.ai/image/models).

#### Responses

##### Status: 200 Success - Returns the generated video

###### Content-Type: video/mp4

`string`, format: `binary`

**Example:**

```json
{}
```

##### Status: 400 Something was wrong with the input data, check the details for more info.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`fieldErrors` (required)**

      `object`

    - **`formErrors` (required)**

      `array`

      **Items:**

      `string`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 400,
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Something was wrong with the input data, check the details for more info.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": "",
      "formErrors": [
        ""
      ],
      "fieldErrors": {
        "propertyName*": [
          ""
        ]
      }
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 401 Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 401,
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 402 Insufficient pollen balance or API key budget exhausted.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 402,
  "success": false,
  "error": {
    "code": "PAYMENT_REQUIRED",
    "message": "Insufficient pollen balance or API key budget exhausted.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 403 Access denied! You don't have the required permissions for this resource or model.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 403,
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied! You don't have the required permissions for this resource or model.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 429 You're making requests too quickly. Please slow down a bit.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 429,
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "You're making requests too quickly. Please slow down a bit.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 500 Oh snap, something went wrong on our end. We're on it!

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 500,
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Oh snap, something went wrong on our end. We're on it!",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

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

```json
{}
```

##### Status: 400 Something was wrong with the input data, check the details for more info.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`fieldErrors` (required)**

      `object`

    - **`formErrors` (required)**

      `array`

      **Items:**

      `string`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 400,
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Something was wrong with the input data, check the details for more info.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": "",
      "formErrors": [
        ""
      ],
      "fieldErrors": {
        "propertyName*": [
          ""
        ]
      }
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 401 Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 401,
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 402 Insufficient pollen balance or API key budget exhausted.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 402,
  "success": false,
  "error": {
    "code": "PAYMENT_REQUIRED",
    "message": "Insufficient pollen balance or API key budget exhausted.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 403 Access denied! You don't have the required permissions for this resource or model.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 403,
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied! You don't have the required permissions for this resource or model.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 429 You're making requests too quickly. Please slow down a bit.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 429,
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "You're making requests too quickly. Please slow down a bit.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 500 Oh snap, something went wrong on our end. We're on it!

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 500,
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Oh snap, something went wrong on our end. We're on it!",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
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

  `number` — Music duration in seconds, 3-300 (elevenmusic only)

- **`instrumental`**

  `boolean` — If true, guarantees instrumental output (elevenmusic only)

- **`model`**

  `string`

- **`response_format`**

  `string`, possible values: `"mp3", "opus", "aac", "flac", "wav", "pcm"`, default: `"mp3"` — The audio format for the output.

- **`speed`**

  `number`, default: `1` — The speed of the generated audio. 0.25 to 4.0, default 1.0.

- **`voice`**

  `string`, default: `"alloy"` — The voice to use. Can be any preset name (alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, matilda, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill) OR a custom ElevenLabs voice ID (UUID from your dashboard).

**Example:**

```json
{
  "model": "",
  "input": "Hello, welcome to Pollinations!",
  "voice": "rachel",
  "response_format": "mp3",
  "speed": 1,
  "duration": 30,
  "instrumental": false
}
```

#### Responses

##### Status: 200 Success - Returns audio data

###### Content-Type: audio/mpeg

`string`, format: `binary`

**Example:**

```json
{}
```

###### Content-Type: audio/opus

`string`, format: `binary`

**Example:**

```json
{}
```

###### Content-Type: audio/aac

`string`, format: `binary`

**Example:**

```json
{}
```

###### Content-Type: audio/flac

`string`, format: `binary`

**Example:**

```json
{}
```

###### Content-Type: audio/wav

`string`, format: `binary`

**Example:**

```json
{}
```

##### Status: 400 Something was wrong with the input data, check the details for more info.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`fieldErrors` (required)**

      `object`

    - **`formErrors` (required)**

      `array`

      **Items:**

      `string`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 400,
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Something was wrong with the input data, check the details for more info.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": "",
      "formErrors": [
        ""
      ],
      "fieldErrors": {
        "propertyName*": [
          ""
        ]
      }
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 401 Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 401,
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 402 Insufficient pollen balance or API key budget exhausted.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 402,
  "success": false,
  "error": {
    "code": "PAYMENT_REQUIRED",
    "message": "Insufficient pollen balance or API key budget exhausted.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 403 Access denied! You don't have the required permissions for this resource or model.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 403,
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied! You don't have the required permissions for this resource or model.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 500 Oh snap, something went wrong on our end. We're on it!

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 500,
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Oh snap, something went wrong on our end. We're on it!",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

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

#### Request Body

##### Content-Type: multipart/form-data

- **`file` (required)**

  `string`, format: `binary` — The audio file to transcribe. Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm.

- **`language`**

  `string` — Language of the audio in ISO-639-1 format (e.g. \`en\`, \`fr\`). Improves accuracy.

- **`model`**

  `string`, default: `"whisper-large-v3"` — The model to use. Options: \`whisper-large-v3\`, \`whisper-1\`, \`scribe\`.

- **`prompt`**

  `string` — Optional text to guide the model's style or continue a previous segment.

- **`response_format`**

  `string`, possible values: `"json", "text", "srt", "verbose_json", "vtt"`, default: `"json"` — The format of the transcript output.

- **`temperature`**

  `number` — Sampling temperature between 0 and 1. Lower is more deterministic.

**Example:**

```json
{
  "file": {},
  "model": "whisper-large-v3",
  "language": "",
  "prompt": "",
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

```json
{
  "text": ""
}
```

##### Status: 400 Something was wrong with the input data, check the details for more info.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`fieldErrors` (required)**

      `object`

    - **`formErrors` (required)**

      `array`

      **Items:**

      `string`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 400,
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Something was wrong with the input data, check the details for more info.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": "",
      "formErrors": [
        ""
      ],
      "fieldErrors": {
        "propertyName*": [
          ""
        ]
      }
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 401 Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 401,
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 402 Insufficient pollen balance or API key budget exhausted.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 402,
  "success": false,
  "error": {
    "code": "PAYMENT_REQUIRED",
    "message": "Insufficient pollen balance or API key budget exhausted.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 403 Access denied! You don't have the required permissions for this resource or model.

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 403,
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied! You don't have the required permissions for this resource or model.",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

##### Status: 500 Oh snap, something went wrong on our end. We're on it!

###### Content-Type: application/json

- **`error` (required)**

  `object`

  - **`code` (required)**

    `string`

  - **`details` (required)**

    `object`

    - **`name` (required)**

      `string`

    - **`stack`**

      `string`

  - **`message` (required)**

    `object`

  - **`timestamp` (required)**

    `string`

  - **`cause`**

    `object`

  - **`requestId`**

    `string`

- **`status` (required)**

  `number`

- **`success` (required)**

  `boolean`

**Example:**

```json
{
  "status": 500,
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Oh snap, something went wrong on our end. We're on it!",
    "timestamp": "",
    "details": {
      "name": "",
      "stack": ""
    },
    "requestId": "",
    "cause": null
  }
}
```

### Upload media

- **Method:** `POST`
- **Path:** `/upload`
- **Tags:** 📦 Media Storage

Upload an image, audio, or video file. Supports multipart/form-data, raw binary, or base64 JSON. Returns a content-addressed hash URL. Duplicate files return the existing hash.

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
  "id": "",
  "url": "",
  "contentType": "",
  "size": 1,
  "duplicate": true
}
```

##### Status: 401 Missing or invalid API key

###### Content-Type: application/json

- **`error` (required)**

  `string`

**Example:**

```json
{
  "error": ""
}
```

##### Status: 413 File too large (max 10MB)

###### Content-Type: application/json

- **`error` (required)**

  `string`

**Example:**

```json
{
  "error": ""
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

##### Status: 400 Invalid hash format

###### Content-Type: application/json

- **`error` (required)**

  `string`

**Example:**

```json
{
  "error": ""
}
```

##### Status: 404 File not found

###### Content-Type: application/json

- **`error` (required)**

  `string`

**Example:**

```json
{
  "error": ""
}
```

### Check if media exists

- **Method:** `HEAD`
- **Path:** `/{hash}`
- **Tags:** 📦 Media Storage

Check existence and metadata without downloading the file.

#### Responses

##### Status: 200 File exists (headers include Content-Type, Content-Length, X-Content-Hash)

##### Status: 400 Invalid hash format

##### Status: 404 File not found

### Delete media

- **Method:** `DELETE`
- **Path:** `/{hash}`
- **Tags:** 📦 Media Storage

Delete a file by its content hash. Only the original uploader can delete their own files.

#### Responses

##### Status: 200 File deleted

###### Content-Type: application/json

- **`deleted` (required)**

  `boolean`

- **`id` (required)**

  `string`

**Example:**

```json
{
  "deleted": true,
  "id": ""
}
```

##### Status: 400 Invalid hash format

###### Content-Type: application/json

- **`error` (required)**

  `string`

**Example:**

```json
{
  "error": ""
}
```

##### Status: 401 Missing or invalid API key

###### Content-Type: application/json

- **`error` (required)**

  `string`

**Example:**

```json
{
  "error": ""
}
```

##### Status: 403 Not the original uploader

###### Content-Type: application/json

- **`error` (required)**

  `string`

**Example:**

```json
{
  "error": ""
}
```

##### Status: 404 File not found

###### Content-Type: application/json

- **`error` (required)**

  `string`

**Example:**

```json
{
  "error": ""
}
```

### SERVERS /{hash}

- **Method:** `SERVERS`
- **Path:** `/{hash}`

## Schemas

### ErrorDetails

- **Type:**`object`

* **`name` (required)**

  `string`

* **`stack`**

  `string`

**Example:**

```json
{
  "name": "",
  "stack": ""
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

* **`stack`**

  `string`

**Example:**

```json
{
  "name": "",
  "stack": "",
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

### MessageContentPart

- **Type:**

**Example:**

### CreateSpeechRequest

- **Type:**`object`

* **`input` (required)**

  `string` — The text to generate audio for. Maximum 4096 characters.

* **`duration`**

  `number` — Music duration in seconds, 3-300 (elevenmusic only)

* **`instrumental`**

  `boolean` — If true, guarantees instrumental output (elevenmusic only)

* **`model`**

  `string`

* **`response_format`**

  `string`, possible values: `"mp3", "opus", "aac", "flac", "wav", "pcm"`, default: `"mp3"` — The audio format for the output.

* **`speed`**

  `number`, default: `1` — The speed of the generated audio. 0.25 to 4.0, default 1.0.

* **`voice`**

  `string`, default: `"alloy"` — The voice to use. Can be any preset name (alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, matilda, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill) OR a custom ElevenLabs voice ID (UUID from your dashboard).

**Example:**

```json
{
  "model": "",
  "input": "Hello, welcome to Pollinations!",
  "voice": "rachel",
  "response_format": "mp3",
  "speed": 1,
  "duration": 30,
  "instrumental": false
}
```
