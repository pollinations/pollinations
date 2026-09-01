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

## Community Models

Community models use an `owner/model` id and appear in the same discovery responses as Pollinations-operated models. Use `community=true` to return only community models or `community=false` to exclude them.

For registration, publishing, pricing, fallbacks, and health monitoring, see [Publish a Model](/docs#tag/publish-a-model). For ownership endpoints and schemas, see [Community Models](/docs#tag/community-models) under Resources.
