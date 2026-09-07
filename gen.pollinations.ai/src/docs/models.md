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

### Filters and health

All model discovery endpoints accept the same optional filters. Omitting them
returns the existing complete catalog without a health lookup.

| Query | Values | Behaviour |
|-------|--------|-----------|
| `source` | `official`, `community` | Return one source; omit for both |
| `reliability` | `all`, `reliable` | Add health to every result, or keep only results with status `on` |

`community=true|false|1|0` remains available as a legacy source filter.
Conflicting or invalid filters return **400 Bad Request**. Source, access, and
reliability filters combine with AND semantics. Reliability never grants or
removes permission to generate with a model.

Health uses the last 24 hours of completed requests. `success_rate` is
`2xx / (2xx + 5xx)`, so successful fallback rescues count as successes while
caller-side 4xx responses are excluded. `sample_size`, `window_minutes`,
`checked_at`, and `stale` disclose confidence and freshness. Missing or small
samples are `unknown`; alpha/preview status remains a separate field. Stale or
unknown models are excluded by `reliability=reliable`.

```bash
curl 'https://gen.pollinations.ai/v1/models?source=official&reliability=reliable'
```

OpenAI-compatible clients that append `/models` to their base URL can use the
equivalent headers instead of query parameters:

```text
Pollinations-Model-Source: official
Pollinations-Model-Reliability: reliable
```

These headers work with Open WebUI and Cline custom OpenAI connections.
LibreChat administrators can set them in the custom endpoint's `headers` map.
The client can use any returned model ID for generation without forwarding the
catalog headers.

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

## Community Models

Community models use an `owner/model` id and appear in the same discovery responses as Pollinations-operated models. Use `source=community` to return only community models or `source=official` to exclude them.

For registration, publishing, pricing, fallbacks, and health monitoring, see [Publish a Model](/docs#tag/publish-a-model). For ownership endpoints and schemas, see [Community Models](/docs#tag/community-models) under Resources.
