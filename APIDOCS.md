# pollinations.ai API

- **OpenAPI Version:** `3.1.0`
- **API Version:** `0.3.0`

Documentation for `gen.pollinations.ai` - the pollinations.ai API gateway.

[📝 Edit docs](https://github.com/pollinations/pollinations/edit/master/enter.pollinations.ai/src/routes/docs.ts)

## Quick Start

Get your API key at <https://enter.pollinations.ai>

### Image Generation

```bash
curl 'https://gen.pollinations.ai/image/a%20cat?model=flux' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

### Text Generation

```bash
curl 'https://gen.pollinations.ai/v1/chat/completions' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"model": "openai", "messages": [{"role": "user", "content": "Hello"}]}'
```

### Vision (Image Input)

```bash
curl 'https://gen.pollinations.ai/v1/chat/completions' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"model": "openai", "messages": [{"role": "user", "content": [{"type": "text", "text": "Describe this image"}, {"type": "image_url", "image_url": {"url": "https://example.com/image.jpg"}}]}]}'
```

**Gemini Tools:** `gemini`, `gemini-large` have `code_execution` enabled (can generate images/plots). `gemini-search` has `google_search` enabled. Responses may include `content_blocks` with `image_url`, `text`, or `thinking` types.

### Simple Text Endpoint

```bash
curl 'https://gen.pollinations.ai/text/hello?key=YOUR_API_KEY'
```

### Streaming

```bash
curl 'https://gen.pollinations.ai/v1/chat/completions' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"model": "openai", "messages": [{"role": "user", "content": "Write a poem"}], "stream": true}' \
  --no-buffer
```

### Model Discovery

**Always check available models before testing:**

- **Image models:** [/image/models](https://gen.pollinations.ai/image/models)
- **Text models:** [/v1/models](https://gen.pollinations.ai/v1/models)

## Authentication

**Two key types (both consume Pollen from your balance):**

- **Publishable Keys (`pk_`):** ⚠️ **Beta - not yet ready for production use.** For client-side apps, IP rate-limited (1 pollen per IP per hour). **Warning:** Exposing in public code will consume your Pollen if your app gets traffic.
- **Secret Keys (`sk_`):** Server-side only, no rate limits. Keep secret - never expose publicly.

**Auth methods:**

1. Header: `Authorization: Bearer YOUR_API_KEY`
2. Query param: `?key=YOUR_API_KEY`

## Account Management

Check your balance and usage via `enter.pollinations.ai`:

```bash
# Check pollen balance
curl 'https://enter.pollinations.ai/api/account/balance' \
  -H 'Authorization: Bearer YOUR_API_KEY'

# Get profile info
curl 'https://enter.pollinations.ai/api/account/profile' \
  -H 'Authorization: Bearer YOUR_API_KEY'

# View usage history
curl 'https://enter.pollinations.ai/api/account/usage' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

## Servers

- **URL:** `https://gen.pollinations.ai`

## Operations

### GET /account/profile

- **Method:** `GET`
- **Path:** `/account/profile`
- **Tags:** gen.pollinations.ai

Get user profile info (name, email, GitHub username, tier). Requires `account:profile` permission for API keys.

#### Responses

##### Status: 200 User profile with name, email, githubUsername, tier, createdAt

###### Content-Type: application/json

- **`createdAt` (required)**

  `string`, format: `date-time` — Account creation timestamp (ISO 8601)

- **`email` (required)**

  `object` — User's email address

- **`githubUsername` (required)**

  `object` — GitHub username if linked

- **`name` (required)**

  `object` — User's display name

- **`tier` (required)**

  `string`, possible values: `"anonymous", "seed", "flower", "nectar"` — User's current tier level

**Example:**

```json
{
  "name": "",
  "email": "",
  "githubUsername": "",
  "tier": "anonymous",
  "createdAt": ""
}
```

##### Status: 401 Unauthorized

##### Status: 403 Permission denied - API key missing \`account:profile\` permission

### GET /account/balance

- **Method:** `GET`
- **Path:** `/account/balance`
- **Tags:** gen.pollinations.ai

Get pollen balance. Returns the key's remaining budget if set, otherwise the user's total balance. Requires `account:balance` permission for API keys.

#### Responses

##### Status: 200 Balance (remaining pollen)

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

### GET /account/usage

- **Method:** `GET`
- **Path:** `/account/usage`
- **Tags:** gen.pollinations.ai

Get request history and spending data from Tinybird. Supports JSON and CSV formats. Requires `account:usage` permission for API keys.

#### Responses

##### Status: 200 Usage records with timestamp, model, tokens, cost\_usd, etc.

###### Content-Type: application/json

- **`count` (required)**

  `number` — Number of records returned

- **`usage` (required)**

  `array` — Array of usage records

  **Items:**

  - **`api_key` (required)**

    `object` — API key identifier used (masked)

  - **`api_key_type` (required)**

    `object` — Type of API key ('secret', 'publishable', 'temporary')

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

### GET /v1/models

- **Method:** `GET`
- **Path:** `/v1/models`
- **Tags:** gen.pollinations.ai

Get available text models (OpenAI-compatible). If an API key with model restrictions is provided, only allowed models are returned.

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

### GET /image/models

- **Method:** `GET`
- **Path:** `/image/models`
- **Tags:** gen.pollinations.ai

Get a list of available image generation models with pricing, capabilities, and metadata. If an API key with model restrictions is provided, only allowed models are returned.

#### Responses

##### Status: 200 Success

###### Content-Type: application/json

**Array of:**

- **`aliases` (required)**

  `array`

  **Items:**

  `string`

- **`name` (required)**

  `string`

- **`pricing` (required)**

  `object`

- **`context_window`**

  `number`

- **`description`**

  `string`

- **`input_modalities`**

  `array`

  **Items:**

  `string`

- **`is_specialized`**

  `boolean`

- **`output_modalities`**

  `array`

  **Items:**

  `string`

- **`reasoning`**

  `boolean`

- **`tools`**

  `boolean`

- **`voices`**

  `array`

  **Items:**

  `string`

**Example:**

```json
[
  {
    "name": "",
    "aliases": [
      ""
    ],
    "pricing": {
      "propertyName*": 1,
      "currency": "pollen"
    },
    "description": "",
    "input_modalities": [
      ""
    ],
    "output_modalities": [
      ""
    ],
    "tools": true,
    "reasoning": true,
    "context_window": 1,
    "voices": [
      ""
    ],
    "is_specialized": true
  }
]
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

### GET /text/models

- **Method:** `GET`
- **Path:** `/text/models`
- **Tags:** gen.pollinations.ai

Get a list of available text generation models with pricing, capabilities, and metadata. If an API key with model restrictions is provided, only allowed models are returned.

#### Responses

##### Status: 200 Success

###### Content-Type: application/json

**Array of:**

- **`aliases` (required)**

  `array`

  **Items:**

  `string`

- **`name` (required)**

  `string`

- **`pricing` (required)**

  `object`

- **`context_window`**

  `number`

- **`description`**

  `string`

- **`input_modalities`**

  `array`

  **Items:**

  `string`

- **`is_specialized`**

  `boolean`

- **`output_modalities`**

  `array`

  **Items:**

  `string`

- **`reasoning`**

  `boolean`

- **`tools`**

  `boolean`

- **`voices`**

  `array`

  **Items:**

  `string`

**Example:**

```json
[
  {
    "name": "",
    "aliases": [
      ""
    ],
    "pricing": {
      "propertyName*": 1,
      "currency": "pollen"
    },
    "description": "",
    "input_modalities": [
      ""
    ],
    "output_modalities": [
      ""
    ],
    "tools": true,
    "reasoning": true,
    "context_window": 1,
    "voices": [
      ""
    ],
    "is_specialized": true
  }
]
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

### POST /v1/chat/completions

- **Method:** `POST`
- **Path:** `/v1/chat/completions`
- **Tags:** gen.pollinations.ai

OpenAI-compatible chat completions endpoint.

**Legacy endpoint:** `/openai` (deprecated, use `/v1/chat/completions` instead)

**Authentication (Secret Keys Only):**

Include your API key in the `Authorization` header as a Bearer token:

`Authorization: Bearer YOUR_API_KEY`

API keys can be created from your dashboard at enter.pollinations.ai. Both key types consume Pollen. Secret keys have no rate limits.

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

  `string`, possible values: `"openai", "openai-fast", "openai-large", "qwen-coder", "mistral", "openai-audio", "gemini", "gemini-fast", "deepseek", "grok", "gemini-search", "chickytutor", "midijourney", "claude-fast", "claude", "claude-large", "perplexity-fast", "perplexity-reasoning", "kimi", "gemini-large", "nova-fast", "glm", "minimax"`, default: `"openai"` — AI model for text generation. See /v1/models for full list.

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

- **`usage` (required)**

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

- **`citations`**

  `array`

  **Items:**

  `string`

- **`prompt_filter_results`**

  `object`

- **`system_fingerprint`**

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

##### Status: 401 You need to authenticate by providing a session cookie or Authorization header (Bearer token).

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
    "message": "You need to authenticate by providing a session cookie or Authorization header (Bearer token).",
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

### GET /text/{prompt}

- **Method:** `GET`
- **Path:** `/text/{prompt}`
- **Tags:** gen.pollinations.ai

Generates text from text prompts.

**Authentication:**

Include your API key either:

- In the `Authorization` header as a Bearer token: `Authorization: Bearer YOUR_API_KEY`
- As a query parameter: `?key=YOUR_API_KEY`

API keys can be created from your dashboard at enter.pollinations.ai.

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

##### Status: 401 You need to authenticate by providing a session cookie or Authorization header (Bearer token).

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
    "message": "You need to authenticate by providing a session cookie or Authorization header (Bearer token).",
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

### GET /image/{prompt}

- **Method:** `GET`
- **Path:** `/image/{prompt}`
- **Tags:** gen.pollinations.ai

Generate an image or video from a text prompt.

**Image Models:** `flux` (default), `turbo`, `gptimage`, `kontext`, `seedream`, `nanobanana`, `nanobanana-pro`

**Video Models:** `veo`, `seedance`

- `veo`: Text-to-video only (4-8 seconds)
- `seedance`: Text-to-video and image-to-video (2-10 seconds)

**Authentication:**

Include your API key either:

- In the `Authorization` header as a Bearer token: `Authorization: Bearer YOUR_API_KEY`
- As a query parameter: `?key=YOUR_API_KEY`

API keys can be created from your dashboard at enter.pollinations.ai.

#### Responses

##### Status: 200 Success - Returns the generated image or video

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

##### Status: 401 You need to authenticate by providing a session cookie or Authorization header (Bearer token).

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
    "message": "You need to authenticate by providing a session cookie or Authorization header (Bearer token).",
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
