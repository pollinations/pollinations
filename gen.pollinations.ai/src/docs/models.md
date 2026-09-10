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

### Supported parameters

Models verified against the generation pipeline expose
`supported_parameters` (the Chat controls they honor) and
`default_parameters` (gateway defaults applied when omitted):

```bash
curl "https://gen.pollinations.ai/v1/models/openai" | jq '{id, supported_parameters, default_parameters}'
```

```json
{
  "id": "openai",
  "supported_parameters": ["messages", "model", "logit_bias", "..."],
  "default_parameters": {"logprobs": false, "stream": false}
}
```

Only verified models carry these fields — anything else omits them rather
than guessing. Verified means checked against the request transforms, not
upstream provider docs: sampling knobs stripped upstream never appear, and
controls the gateway translates (like `reasoning_effort` on Claude) are
listed as supported with the mapping noted. These describe Chat Completions
(and the `GET /text` surface); the native Responses API may differ.

Use `supported_endpoints` to discover which public API routes accept each
model. `/v1/responses` identifies built-in models with a configured native
Responses route, community text models and endpoint agents whose owner supplied
the Responses API and one exact URL, and managed prompt agents. These community
models and agents also accept `/v1/chat/completions` through the shared adapter.
Built-in models may use separate upstream routes for Chat and Responses.
Supported media models also advertise both endpoints and return generated-file
links as assistant text. Reference-required models return their normal missing-input
error; use their native endpoint until attachments are supported here.

## Community Models

Community models use an `owner/model` id and appear in the same discovery responses as Pollinations-operated models. Use `community=true` to return only community models or `community=false` to exclude them.

For registration, publishing, pricing, fallbacks, and health monitoring, see [Publish a Model](/docs#tag/publish-a-model). For ownership endpoints and schemas, see [Community Models](/docs#tag/community-models) under Resources.
