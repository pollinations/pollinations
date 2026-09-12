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

All model discovery endpoints accept optional `source` and `reliability` query parameters:

| Parameter | Values | Behaviour |
|-----------|--------|-----------|
| *(omitted)* | | Returns all models (default, backward-compatible) |
| `source=official` | `official` | Excludes community models — returns Pollinations-operated models only |
| `source=community` | `community` | Returns community models only |
| `reliability=reliable` | `reliable` | Keeps only models whose measured health is not poor; unmeasured models stay (missing data means unknown) |
| `reliability=all` | `all` | Returns every model (default) |

Any other value (e.g. `source=true`, `reliability=unreliable`) returns **400 Bad Request**.

Example: `GET /models?source=official&reliability=reliable`

Clients that cannot add query parameters may send the equivalent
`Pollinations-Model-Source` and `Pollinations-Model-Reliability` headers. A
conflicting query and header value returns **400 Bad Request**.

Filtering discovery never changes generation permissions or routing: a model hidden by `?reliability=reliable` still generates normally when requested directly.

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

### Client examples

Most OpenAI-compatible clients fetch models by appending `/models` to a base
URL. Configure the filter headers when the client supports custom headers, or
fetch the filtered list separately:

**curl**

```bash
curl "https://gen.pollinations.ai/v1/models?source=official&reliability=reliable"
```

**OpenAI SDK (fetch the list yourself, then use the SDK for generation)**

```python
import requests
from openai import OpenAI

models = requests.get(
    "https://gen.pollinations.ai/v1/models",
    params={"source": "official", "reliability": "reliable"},
).json()
ids = [m["id"] for m in models["data"]]

client = OpenAI(base_url="https://gen.pollinations.ai", api_key=API_KEY)
response = client.chat.completions.create(model=ids[0], messages=[...])
```

**Cline / Open WebUI / LibreChat:** these tools query `<base URL>/models` with
no query parameters, so all models are listed; pick models from the filtered
response above when choosing which to use.

### Health metadata

When measured reliability data exists, each model object carries a `health`
field:

```json
{
  "name": "openai/gpt-5-nano",
  "health": {
    "status": "healthy",
    "success_rate": 0.997,
    "sample_size": 3184,
    "window_minutes": 1440,
    "checked_at": "2026-09-07T12:00:00.000Z",
    "stale": false
  }
}
```

- `success_rate` is final-response 2xx / (2xx + 5xx) over the window. Caller
  errors (4xx — bad auth, no balance, invalid request, rate limits) are
  excluded from the sample, and requests rescued by a fallback model count as
  successes, because that is what the caller experienced.
- `status` is `unavailable` at ≥20% failures, `degraded` at ≥5%, otherwise
  `healthy` — the same thresholds as the internal model monitor.
- `status` is `unknown` below a minimum sample size or when no data exists.
  Missing data means unknown, never healthy.
- `stale` is `true` when the value was served from cache during a monitoring
  outage.
- Experimental (alpha) status is a separate model field, not a health state.

Raw per-model rows (latency, tokens/sec, per-event-type breakdowns) are
available from [`/v1/models/status`](/docs#tag/pollinations-Monitor). Health
depends on traffic: a model with no recent requests reports `unknown`.

## Community Models

Community models use an `owner/model` id and appear in the same discovery responses as Pollinations-operated models. Use `source=community` to return only community models or `source=official` to exclude them.

For registration, publishing, pricing, fallbacks, and health monitoring, see [Publish a Model](/docs#tag/publish-a-model). For ownership endpoints and schemas, see [Community Models](/docs#tag/community-models) under Resources.
