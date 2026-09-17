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

### Filters

All model list endpoints above accept the same optional `source` filter:
`official` or `community`. Omit it for both. `community=true|false|1|0`
remains available as a legacy source filter. The query overrides the
connection-wide header; `source` overrides `community`. Invalid values return
**400 Bad Request**. The filter combines with the caller's access restrictions;
it does not change generation permissions.

```bash
curl 'https://gen.pollinations.ai/v1/models?source=official'
```

OpenAI-compatible clients that append `/models` to their base URL can use the
equivalent header instead of the query parameter:

```text
Pollinations-Model-Source: official
```

This header works with Open WebUI and Cline custom OpenAI connections.
LibreChat administrators can set it in the custom endpoint's `headers` map.
The client can use any returned model ID for generation without forwarding the
catalog header.

Model lists carry no health data. Recent request counts, error rates, latency
and fallback breakdowns per model are served separately by
`/models/status`, described in [Public Stats](/docs#tag/public-stats).

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

Community models and agents use a canonical `community/owner/model` id and appear in the same discovery responses as Pollinations-operated models. Use `community=true` to return only community models or `community=false` to exclude them.

The old `owner/model` IDs remain generation aliases in each model's `aliases` array. Key creation and updates accept only canonical model IDs. Existing stored permissions are migrated with the rename.

The `source=community` and `source=official` filters are equivalent source filters
for discovery. Source, access, and status filters combine with AND semantics.

For registration, publishing, pricing, fallbacks, and health monitoring, see [Publish a Model](/docs#tag/publish-a-model). For ownership endpoints and schemas, see [Community Models](/docs#tag/community-models) under Resources.
