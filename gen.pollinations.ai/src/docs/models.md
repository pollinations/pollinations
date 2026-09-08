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

### Client examples

Most OpenAI-compatible clients fetch models by appending `/models` to a base
URL, so query filters cannot be used there — pass the filters from an
environment where you control the request instead:

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
  "name": "openai-fast",
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
