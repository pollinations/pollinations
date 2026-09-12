## Models

Discover available models with pricing, capabilities, and metadata. No authentication required.

| Endpoint | Returns |
|----------|---------|
| `GET /models` | All models with pricing, capabilities, and metadata |
| `GET /v1/models` | All models in OpenAI-compatible format (`{object: "list", data: [...]}`) |
| `GET /text/models` | Text models with pricing, context window, tool support |
| `GET /image/models` | Image & video models with capabilities and pricing |
| `GET /video/models` | Video models with capabilities and pricing |
| `GET /audio/models` | Audio models with supported voices |
| `GET /embeddings/models` | Embedding models with supported modalities |
| `GET /3d/models` | 3D Generation models with supported modalities |

### Query Parameters

All model discovery endpoints accept an optional `community` query parameter:

| Parameter | Values | Behaviour |
|-----------|--------|-----------|
| *(omitted)* | | Returns all models (default, backward-compatible) |
| `community=false` | `false`, `0` | Excludes community models — returns official models only |
| `community=true` | `true`, `1` | Returns community models only |

Any other value (e.g. `tru`, `yes`, `2`) returns **400 Bad Request**.

Example: `GET /models?community=false`

### Reliability filtering and health metadata

All model discovery endpoints also accept an optional `reliability` query
parameter:

| Parameter | Values | Behaviour |
|-----------|--------|-----------|
| *(omitted)* | | Returns all models (default, backward-compatible) |
| `reliability=reliable` | `reliable` | Keeps only models with a high recent success rate |
| `reliability=all` | `all` | Explicit default, same as omitting |

Every entry in `/v1/models`, `/v1/models/:model`, and the rich lists
carries two extra fields:

- `reliability`: `reliable`, `unreliable`, or `unknown`. A model is
  `reliable` when at least 20 requests were observed in the last 60 minutes
  and at least 95% succeeded. Requests rescued by a fallback count as
  successes; requests the caller broke (4xx) are excluded. No usable data
  means `unknown` — experimental status is tracked separately and never
  affects this verdict.
- `health`: `{success_rate, sample_count, window_minutes, last_request_at}`,
  or `null` when unknown.

Examples:

```bash
# Official, reliable models only
curl "https://gen.pollinations.ai/v1/models?community=false&reliability=reliable"

# Same via headers, for clients that append /models to a base URL
# and cannot add query strings (Open WebUI, LibreChat, Cline)
curl https://gen.pollinations.ai/v1/models \
  -H "X-Model-Source: official" \
  -H "X-Model-Reliability: reliable"
```

```python
import requests

models = requests.get(
    "https://gen.pollinations.ai/v1/models",
    params={"reliability": "reliable"},
).json()["data"]
print([(m["id"], m["reliability"], m["health"]) for m in models])
```

Query parameters win when both a query param and its header are present.
Filtering never changes generation permissions: hidden, permission-filtered,
and unaffordable models stay hidden exactly as before.

Rich model endpoints include `capabilities` for agentic/model traits:
`tool_calling`, `reasoning`, `web_search`, and `code_execution`.
Modalities, video frame controls, voices, and context length remain separate
structured fields.

Use `supported_endpoints` to discover which public API routes accept each
model. `/v1/responses` identifies built-in models with a configured native
Responses route, community text models and endpoint agents whose owner supplied
the Responses API and one exact URL, and managed prompt agents. These community
models and agents also accept `/v1/chat/completions` through the shared adapter.
Built-in models may use separate upstream routes for Chat and Responses.
Supported media models also advertise both endpoints and return generated-file
links as assistant text. Reference-required models return their normal missing-input
error; use their native endpoint until attachments are supported here.

### Chat parameters

Official Chat models include `supported_parameters`: verified generation
controls honored through `/v1/chat/completions` on the model's primary route.

This field describes Pollinations' Chat behavior, not the native
`/v1/responses` API. Unverified controls are omitted; inclusion does not mean
every value or combination is supported. Provider fallback routes can have
different controls. Community models omit this field.
For example,
`openai/gpt-5.4` omits sampling controls because its Chat transform removes
them, while `openai/gpt-oss-20b` forwards `temperature` and `top_p`.
On `anthropic/claude-sonnet-4.6`, those two controls are mutually exclusive
(`temperature` wins), and both are disabled when `reasoning_effort` is enabled.
Newer Claude and Gemini models may omit sampling controls entirely. On
Sonnet 4.6, `response_format` supports `json_schema`, not `json_object`.
Reasoning effort levels and forced-tool restrictions remain model-specific.

## Community Models

Community models use an `owner/model` id and appear in the same discovery responses as Pollinations-operated models. Use `community=true` to return only community models or `community=false` to exclude them.

For registration, publishing, pricing, fallbacks, and health monitoring, see [Publish a Model](/docs#tag/publish-a-model). For ownership endpoints and schemas, see [Community Models](/docs#tag/community-models) under Resources.
