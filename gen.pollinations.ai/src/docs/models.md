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
parameters. Every listing carries a minimal `health` block (status, success
rate, sample count, window, freshness) per model when health data is
available.

| Parameter | Values | Behaviour |
|-----------|--------|-----------|
| *(omitted)* | | Returns all models (default) |
| `source=official` | `official` | Returns first-party models only |
| `source=community` | `community` | Returns community-published models only |
| `reliable=true` | `true`, `1` | Keeps only models with `healthy` status |
| `reliable=false` | `false`, `0`, *(omitted)* | Keeps every model |

`community=true|false|1|0` remains available as a backward-compatible alias
for `source`. Personal access rules are never changed by these discovery
filters: permission and paid-balance filtering always applies first, and a
model hidden from a filtered listing can still be called and retrieved by id.
Reliability uses the health status computed from the monitored window
(`healthy` / `degraded` / `unavailable` / `unknown`); missing or stale health
data reports `unknown`, which is excluded by `reliable=true`.

Any other value (e.g. `source=bogus`, `reliable=2`, `community=tru`) or
conflicting source filters (e.g. `source=official&community=true`) returns
**400 Bad Request**.

Example: `GET /models?source=official&reliable=true`

OpenAI-compatible clients that append `/models` to a configured base URL
(Open WebUI, LibreChat, Cline) cannot carry query parameters there. Send the
same filters as the `X-Pollinations-Model-Filter` header in URL query format;
explicit query parameters (or the legacy `community` alias) win if both are
present:

```text
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

## Community Models

Community models use an `owner/model` id and appear in the same discovery responses as Pollinations-operated models. Use `source=community` to return only community models or `source=official` to exclude them.

For registration, publishing, pricing, fallbacks, and health monitoring, see [Publish a Model](/docs#tag/publish-a-model). For ownership endpoints and schemas, see [Community Models](/docs#tag/community-models) under Resources.
