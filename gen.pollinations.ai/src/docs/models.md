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

All model discovery endpoints accept the same optional filters. Omitting them
returns every model the caller can see, exactly as before.

| Parameter | Values | Behaviour |
|-----------|--------|-----------|
| `source` | `all` (default), `official`, `community` | Filter by who publishes the model |
| `reliability` | `all` (default), `reliable` | Return only models whose recent health clears the thresholds |
| `health` | `true`, `false`, `1`, `0` | Attach a `health` object to every model. Implied by `reliability=reliable` |
| `community` | `true`, `false`, `1`, `0` | **Deprecated.** `true` ≡ `source=community`, `false` ≡ `source=official`. Ignored when `source` is present |

Any other value (e.g. `source=tru`, `reliability=perfect`) returns **400 Bad Request**.

```bash
curl "https://gen.pollinations.ai/models?source=official"
curl "https://gen.pollinations.ai/v1/models?reliability=reliable"
curl "https://gen.pollinations.ai/image/models?health=true"
```

#### Header equivalents

Several OpenAI-compatible clients build the catalog URL by appending `/models`
to a configured base URL, which discards any query string. Every filter above is
also readable from a header, so those clients can still narrow the list:

| Header | Equivalent to |
|--------|---------------|
| `X-Pollinations-Model-Source` | `?source=` |
| `X-Pollinations-Model-Reliability` | `?reliability=` |
| `X-Pollinations-Model-Health` | `?health=` |

A query parameter always wins over the header, so an explicit URL beats a
client-wide default.

- **Open WebUI** — *Settings → Connections → OpenAI API*: set the base URL to
  `https://gen.pollinations.ai/v1` and add `X-Pollinations-Model-Source: official`
  under that connection's custom headers.
- **LibreChat** — in `librechat.yaml`, under the custom endpoint:
  `headers: { X-Pollinations-Model-Source: "official" }`.
- **Cline** — *OpenAI Compatible* provider: add the same header in the provider's
  custom-headers section.

#### Health metadata

With `health=true`, every model carries:

```json
{
  "name": "openai/gpt-5.4-nano",
  "health": {
    "status": "reliable",
    "success_rate": 0.9982,
    "sample_size": 15234,
    "window_minutes": 60,
    "checked_at": "2026-09-08T12:00:00.000Z",
    "stale": false
  }
}
```

| Field | Meaning |
|-------|---------|
| `status` | `reliable`, `degraded`, or `unknown` |
| `success_rate` | Successes ÷ attempts, or `null` when unknown |
| `sample_size` | Attempts observed in the window |
| `window_minutes` | Length of the rolling window |
| `checked_at` | When the data was last fetched |
| `stale` | Data is past its freshness budget or came from a fallback cache |

A request the fallback layer rescued still returned a usable result, so it counts
as a success. Caller-side `4xx` failures are excluded from both the rate and the
sample — they say nothing about the model. A model with no traffic in the window
is `unknown`, and `reliability=reliable` excludes it, so `reliable` always means
"we have recently seen this work" rather than "nothing has gone wrong yet".
Experimental or preview status is separate from health and is unaffected by these
filters.

These parameters filter **discovery only**. They never change which models an
account is permitted to generate with; permission and balance filtering still
runs first, and a filtered listing is always a subset of the unfiltered one.

Raw per-provider rows remain available at `GET /v1/models/status`.

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
