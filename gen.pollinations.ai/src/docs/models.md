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

### Discovery filters and health

All model-list endpoints support the same opt-in filters. With no filters, the
response is unchanged and no health lookup is performed.

| Query parameter | Values | Behaviour |
|-----------------|--------|-----------|
| `source` | `all`, `official`, `community` | Return every accessible model (default), Pollinations-operated models, or community models |
| `reliability` | `all`, `reliable` | Add health to every result, or return only models currently meeting the reliability threshold |
| `community` | `true`, `1`, `false`, `0` | Legacy source filter; prefer `source` |

The equivalent headers are `X-Pollinations-Model-Source` and
`X-Pollinations-Model-Reliability`. Query parameters take precedence over
headers. Invalid values and conflicting `source` and `community` query filters
return **400 Bad Request**.

```bash
# Official models that are currently reliable
curl "https://gen.pollinations.ai/v1/models?source=official&reliability=reliable"

# Same selection with persistent client headers
curl https://gen.pollinations.ai/v1/models \
  -H "X-Pollinations-Model-Source: official" \
  -H "X-Pollinations-Model-Reliability: reliable"
```

`reliability=all` adds a `health` object with `success_rate`, `sample_count`,
`window_minutes`, `checked_at`, and `stale`. The 60-minute success rate is
calculated from final 2xx and 5xx responses. Caller-side 4xx failures are
excluded, and a successful fallback is already counted once as a 2xx response.
Missing measurements are explicit (`success_rate: null`, `sample_count: 0`).

`reliability=reliable` requires fresh health, at least 10 eligible samples, and
a success rate of at least 90%. Unknown, low-sample, stale, and degraded models
are excluded. The existing `alpha` flag on rich model listings stays separate
and is not used as a reliability signal.

These filters only affect discovery. They run after key permissions and paid
balance rules, and do not grant or remove generation access.

### OpenAI-compatible clients

Use the base URL `https://gen.pollinations.ai/v1` and add the two headers above
as persistent custom headers:

- **Open WebUI:** Admin Settings → Connections → OpenAI → add the URL and
  custom headers. Its OpenAI connection applies configured headers to both
  model discovery and generation ([implementation](https://github.com/open-webui/open-webui/blob/main/backend/open_webui/routers/openai.py)).
- **LibreChat:** configure a custom endpoint with `models.fetch: true` and the
  headers map below. LibreChat uses endpoint headers for model fetching and
  requests ([configuration reference](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/custom_endpoint)).

  ```yaml
  endpoints:
    custom:
      - name: Pollinations
        baseURL: https://gen.pollinations.ai/v1
        models:
          default: []
          fetch: true
        headers:
          X-Pollinations-Model-Source: official
          X-Pollinations-Model-Reliability: reliable
  ```

- **Cline:** choose OpenAI Compatible, set the same base URL, then use **Add
  Header** twice. Cline stores these headers with the provider and reuses them
  when refreshing models ([implementation](https://github.com/cline/cline/blob/main/apps/vscode/webview-ui/src/components/settings/providers/OpenAICompatible.tsx)).

Clients may also send these headers on generation requests; Pollinations ignores
them outside model-list endpoints, so generation behaviour and permissions stay
unchanged.

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

For registration, publishing, pricing, fallbacks, and health monitoring, see [Publish a Model](/docs#tag/publish-a-model). For ownership endpoints and schemas, see [Community Models](/docs#tag/community-models) under Resources.
