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

All model discovery endpoints accept optional `source` and `reliable` query
parameters, plus every listing response carries a minimal `health` block
(success rate, sample count, window, freshness) when health data is
available:

| Parameter | Values | Behaviour |
|-----------|--------|-----------|
| `source` | `official`, `community`, `all` | `official` returns first-party models only, `community` returns community-published models only. Omitted or `all` returns every model |
| `reliable` | `true`, `1` | Keeps only models with sufficient observed health: success rate >= 0.9 across >= 10 samples in the current health window. Models without health data are treated as unknown and excluded |
| `reliable` | `false`, `0`, *(omitted)* | Keeps every model |

Any other value (e.g. `source=bogus`, `reliable=2`) returns
**400 Bad Request**. Filtering discovery never changes generation
permissions: a model hidden from a filtered listing can still be called and
retrieved by id.

Example: `GET /models?source=official&reliable=true`

Clients that append `/models` to a configured base URL (Open WebUI,
LibreChat, Cline) cannot carry query parameters in the base URL, so the same
filters may be sent as the `X-Pollinations-Model-Filter` header in URL query
format. Explicit query parameters win over header values:

```
# LibreChat custom endpoint header
X-Pollinations-Model-Filter: source=official&reliable=true
```

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

Community models use an `owner/model` id and appear in the same discovery responses as Pollinations-operated models. Use `source=community` to return only community models or `source=official` to exclude them.

For registration, publishing, pricing, fallbacks, and health monitoring, see [Publish a Model](/docs#tag/publish-a-model). For ownership endpoints and schemas, see [Community Models](/docs#tag/community-models) under Resources.
