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

### Discovery filters

All list endpoints accept these query parameters and equivalent headers.
Keep the base URL as `https://gen.pollinations.ai/v1` in OpenAI-compatible
clients that append `/models`; put filters in headers instead of the base URL.

| Query | Header | Values |
|-------|--------|--------|
| `source` | `X-Pollinations-Model-Source` | `all`, `official`, `community` |
| `reliability` | `X-Pollinations-Model-Reliability` | `all`, `reliable` |

Query parameters take precedence over the corresponding header. Invalid values
return 400. Existing `community=true|1|false|0` is still accepted; combining it
with a contradictory `source` returns 400. Omitted filters preserve the default
list and response fields. Visibility, private-model ownership, API-key model
permissions and paid-balance rules are applied before discovery filters.
Filters do not change which known model IDs can be used for generation.

`reliability=all` includes a `health` object without excluding models.
`reliability=reliable` additionally requires fresh observations and a final
server-error rate below 5%, matching the model monitor's healthy threshold.
Experimental/alpha status is independent: an experimental model can be reliable.

| Health field | Meaning |
|--------------|---------|
| `success_rate` | Final 2xx / (final 2xx + final 5xx), between 0 and 1; null when no eligible traffic was observed |
| `sample_count` | Number of final 2xx and 5xx responses in the window |
| `window_minutes` | Rolling observation window, 60 minutes |
| `checked_at` | UTC timestamp of the health-feed fetch, or null when unavailable |
| `last_request_at` | Latest observed final request timestamp, or null when unknown |
| `stale` | True when the feed cannot refresh, is at least 60 seconds old, or the model has no request in the window |

Successful fallback rescues count once as successes; intermediate failed
attempts and caller-side 4xx are excluded from the ratio. One eligible request
is sufficient to calculate a rate; inspect `sample_count` when assessing how
representative it is. Missing observations are unknown, never implicitly
healthy. During a health-feed outage, `all` retains models with stale/unknown
metadata and `reliable` excludes them. Discovery without a reliability option
does not fetch health data.

```sh
curl 'https://gen.pollinations.ai/image/models?source=official&reliability=all'
curl 'https://gen.pollinations.ai/v1/models' \
  -H 'X-Pollinations-Model-Source: official' \
  -H 'X-Pollinations-Model-Reliability: reliable'
```

### Client examples

OpenAI JavaScript SDK:

```js
import OpenAI from "openai";
const client = new OpenAI({
  apiKey: process.env.POLLINATIONS_API_KEY,
  baseURL: "https://gen.pollinations.ai/v1",
  defaultHeaders: {
    "X-Pollinations-Model-Source": "official",
    "X-Pollinations-Model-Reliability": "reliable",
  },
});
const { data } = await client.models.list();
const selected = data.find(m => m.category === "text");
if (!selected) throw new Error("No matching text models; try reliability=all.");
const response = await client.chat.completions.create({
  model: selected.id,
  messages: [{ role: "user", content: "Hello" }],
});
```

AI SDK with an OpenAI-compatible provider (discovery is performed by the app):

```js
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
const baseURL = "https://gen.pollinations.ai/v1";
const apiKey = process.env.POLLINATIONS_API_KEY;
const headers = { "X-Pollinations-Model-Source": "official" };
const discovery = await fetch(`${baseURL}/models`, {
  headers: { ...headers, Authorization: `Bearer ${apiKey}` },
});
if (!discovery.ok) throw new Error(`Discovery failed: ${discovery.status}`);
const { data } = await discovery.json();
const selected = data.find(m => m.category === "text");
if (!selected) throw new Error("No matching text models.");
const provider = createOpenAICompatible({ name: "pollinations", baseURL, apiKey, headers });
const result = await generateText({ model: provider.chatModel(selected.id), prompt: "Hello" });
```

These two clients are exercised against the local gateway with a test upstream
in the focused community-endpoint test, including discovery, successful
completion, reused health caching, and stale-feed behavior. This is not a live
provider or desktop-client end-to-end result. Open WebUI, LibreChat and Cline
support custom headers; retain their plain `/v1` base URL. LibreChat headers
are configured by its administrator in the custom endpoint configuration.

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

Community models use an `owner/model` id and appear in the same discovery responses as Pollinations-operated models. Use `community=true` to return only community models or `community=false` to exclude them.

For registration, publishing, pricing, fallbacks, and health monitoring, see [Publish a Model](/docs#tag/publish-a-model). For ownership endpoints and schemas, see [Community Models](/docs#tag/community-models) under Resources.
