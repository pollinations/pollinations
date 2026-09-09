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

### Chat parameter support

`/models`, `/text/models`, and the OpenAI-compatible `/v1/models` endpoints
expose two optional fields on official Chat models whose support is verified
against the Pollinations Chat route:

| Field | Meaning |
|-------|---------|
| `supported_parameters` | Controls accepted and forwarded by `/v1/chat/completions` for this model |
| `default_parameters` | Values Pollinations applies when a Chat caller omits the control |

Verified models today: `openai/gpt-5.4`, `openai/gpt-oss-20b`, and
`anthropic/claude-sonnet-4.6`. Their routes differ (Azure OpenAI, OVHcloud,
Bedrock), so their controls differ too:

- `openai/gpt-5.4` routes through a transform that drops sampling controls
  (`temperature`, `top_p`, penalties, `seed`) before dispatch. The request
  schema still accepts them, but they are silently ignored — so they are not
  listed.
- `openai/gpt-oss-20b` passes standard Chat sampling controls through.
- `anthropic/claude-sonnet-4.6` accepts `temperature` and `top_p` under a
  condition: they are mutually exclusive, and `temperature` wins.
  `reasoning_effort` maps onto adaptive thinking.

Both fields describe the Pollinations Chat route only — they do not describe
the native `/v1/responses` API. Models without an entry (including all
community models) omit both fields; unknown support is never invented.
Controls outside `supported_parameters` are not guaranteed: the request
schema may accept them while the route ignores them.

## Community Models

Community models use an `owner/model` id and appear in the same discovery responses as Pollinations-operated models. Use `community=true` to return only community models or `community=false` to exclude them.

For registration, publishing, pricing, fallbacks, and health monitoring, see [Publish a Model](/docs#tag/publish-a-model). For ownership endpoints and schemas, see [Community Models](/docs#tag/community-models) under Resources.
