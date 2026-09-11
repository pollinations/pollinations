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

| Parameter | Values | Behaviour |
|-----------|--------|-----------|
| *(omitted)* | | Returns all models (default, backward-compatible) |
| `source=official` | `official` | Official Pollinations-operated models only (Enter `source:official` terminology) |
| `source=community` | `community` | Community-published models only |
| `source=all` | `all` | Everything (same as omitting) |
| `community=false` | `false`, `0` | Deprecated alias for `source=official` |
| `community=true` | `true`, `1` | Deprecated alias for `source=community` |
| `include_health=true` | `true`, `1` | Attach minimal `health` metadata per model (default: omitted) |
| `health_window=1440` | `1`–`10080` | Health rolling window in minutes (default `60`, like `/v1/models/status`) |
| `min_success_rate=0.95` | `0`–`1` | Keep only models at/above this success rate; unknown-health models are excluded |

If `source` and `community` disagree the request is rejected with **400** —
use `source`. Any other invalid value also returns **400**.

Filtering is discovery-only: it runs after API-key permissions and paid-balance
rules and never changes what you may generate with. Default listings (no
params) are unchanged.

Examples:

```bash
GET /v1/models?source=official
GET /text/models?source=official&include_health=true&health_window=1440
GET /v1/models?min_success_rate=0.95&include_health=true
```

### Health metadata

Opt-in per-model `health` (same source as `GET /v1/models/status` and the
dashboard uptime dot):

```json
{
  "success_rate": 0.987,
  "sample_count": 1523,
  "window_minutes": 60,
  "fetched_at": "2026-09-11T05:00:00.000Z",
  "status": "healthy",
  "stale": true
}
```

- `success_rate`: `status_2xx / (status_2xx + errors_5xx)` in the window
  (`0`–`1`, `null` when unknown). Tinybird `2xx` already includes
  fallback-rescued requests, so rescues count as successes; caller-side `4xx`
  failures are excluded.
- `sample_count`: reliability sample (`2xx + 5xx`); `0` with
  `status: "unknown"` means no data in the window — unknown, not unhealthy.
- `status`: `healthy` / `degraded` (≥10% `5xx`) / `down` (≥50% `5xx`) /
  `unknown`, reusing dashboard semantics. Experimental (`alpha`) status is
  separate and never folded into reliability.
- `stale: true` appears only when Tinybird was unreachable and a cached
  window was served; listings never fail because health is unavailable.

### Client setup (Open WebUI, LibreChat, Cline)

These clients append `/models` to the configured base URL, so query strings
embedded in the base URL break discovery. Configure the plain base URL and
pass filters as headers instead (query params take precedence when both are
set; headers also work for generation clients that forward them):

| Header | Equivalent query |
|--------|------------------|
| `X-Pollinations-Source: official` | `?source=official` |
| `X-Pollinations-Include-Health: true` | `?include_health=true` |
| `X-Pollinations-Health-Window: 1440` | `?health_window=1440` |
| `X-Pollinations-Min-Success-Rate: 0.95` | `?min_success_rate=0.95` |

```bash
# curl: official-only discovery + generation still uses the full catalog
curl -H "X-Pollinations-Source: official" https://gen.pollinations.ai/v1/models
curl https://gen.pollinations.ai/v1/models?source=official

# Open WebUI: Admin Panel → Connections → OpenAI-compatible endpoint
# Base URL: https://gen.pollinations.ai/v1 (no query string)
# Add HTTP header: X-Pollinations-Source = official

# LibreChat (administrator-configured custom endpoint, librechat.yaml):
# customEndpoints:
#   - name: "Pollinations"
#     apiKey: "${POLLINATIONS_API_KEY}"
#     baseURL: "https://gen.pollinations.ai/v1"
#     headers:
#       X-Pollinations-Source: "official"

# Cline (OpenAI-compatible provider):
# Base URL: https://gen.pollinations.ai/v1, API key: your Pollinations key.
# Cline does not send custom headers for discovery; use the default catalog
# (all models) for setup, then select an official model for generation.
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

## Community Models

Community models use an `owner/model` id and appear in the same discovery responses as Pollinations-operated models. Use `source=community` to return only community models or `source=official` to exclude them (`community=true/false` still works as a deprecated alias).

For registration, publishing, pricing, fallbacks, and health monitoring, see [Publish a Model](/docs#tag/publish-a-model). For ownership endpoints and schemas, see [Community Models](/docs#tag/community-models) under Resources.
