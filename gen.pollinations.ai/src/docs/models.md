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

Lists default to `reliability=reliable`: public community proxy models need more than
80% success across the last 50 eligible final requests within seven days.
Official models, agents, and owner-only private models are unaffected. There is no minimum sample size.
Models without observations remain listed. Successful fallbacks count as successes
for the requested model; final 4xx are excluded, while owner requests and
monitor probes count. Each entry includes `health` with `status`,
`success_rate` (null without observations), and `requests` (at most 50 for
community proxies). Other models keep their 24-hour health window. Health
refreshes roughly every 60 seconds; unavailable analytics fails open.

Use `?reliability=all` or `Pollinations-Model-Reliability: all` to see all
otherwise accessible models. The query takes precedence over the header.
This only affects discovery: exact-ID calls, retrieval and fallback routing
remain available. Authentication, key permissions, paid access and manual
hiding still apply. Owners can manage all their models in My Models.

Time-windowed traffic, latency and fallback breakdowns are served separately by
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

## Pollinations-imposed limits

Pollinations sometimes exposes stricter limits than an upstream provider.
Discovery responses already carry the authoritative fields; this page is a
human-readable index of the common caps so clients do not have to infer them
from provider docs.

## How to read limits from the API

On `GET /models`, `GET /image/models`, `GET /text/models`, and related lists:

| Field | Meaning |
| --- | --- |
| `max_duration` / `min_duration` / `allowed_durations` | Video length caps in seconds |
| `resolutions` | Allowed output resolutions when Pollinations restricts them |
| `per_user_rpm` | Per-user request rate limit (null/omit = no Pollinations RPM cap) |
| `max_reference_images` | Max images accepted as references / vision inputs |

Generation rejects values outside these ranges. Upstream may advertise wider
options; the registry wins for Pollinations requests.

## Notable caps (registry snapshot)

| Model | Duration | Resolutions | RPM | Max refs |
| --- | --- | --- | --- | --- |
| `alibaba/happyhorse-1.1` | 3–15s |  |  | 1 |
| `alibaba/wan-2.2-fast` | 5s |  |  | 2 |
| `alibaba/wan-2.6` | 5, 10, 15s |  |  | 1 |
| `alibaba/wan-2.7` | 2–15s | 720p, 1080p |  | 2 |
| `alibaba/wan-3.0` | 5s | 480p, 720p, 1080p |  | 2 |
| `amazon/nova-reel-v1` | 6–120s |  |  | 1 |
| `black-forest-labs/flux.1-schnell` |  |  | 60 |  |
| `black-forest-labs/flux.2-klein-4b` |  |  | 60 | 10 |
| `bytedance/seedance-1-pro-fast` | 2–10s | 720p, 480p, 1080p |  | 1 |
| `bytedance/seedance-2.0` | 4–15s |  |  | 2 |
| `bytedance/seedance-2.0-fast` | 4–5s | 480p |  | 2 |
| `bytedance/seedance-2.0-mini` | 4–10s | 720p, 480p |  | 2 |
| `bytedance/seedance-2.5` | 4s | 480p, 720p |  | 2 |
| `bytedance/seedream-5.0-lite` |  |  | 60 | 14 |
| `deepseek/deepseek-v4-flash` |  |  | 60 |  |
| `deepseek/deepseek-v4.1-flash` |  |  | 60 |  |
| `google/gemini-omni-1.1-flash` | 3–10s | 720p, 360p, 1080p, 4k |  | 2 |
| `google/veo-3.1-fast` | 4, 6, 8s | 720p, 1080p |  | 2 |
| `lykon/dreamshaper-8-lcm` |  |  | 300 |  |
| `meta/llama-4-scout` |  |  | 60 | 10 |
| `meta/muse-glimmer-30b` |  |  | 60 | 30 |
| `microsoft/mai-image-2.5-flash` |  |  | 12 | 1 |
| `minimax/minimax-h3` | 5s | 480p, 768p, 2k |  |  |
| `minimax/minimax-h3-max-turbo` | 5, 10, 15s | 480p, 768p, 1080p |  | 2 |
| `minimax/minimax-m3` |  |  | 60 | 30 |
| `mistralai/mistral-small-4` |  |  | 60 | 8 |
| `nvidia/nemotron-3.5-lightning` |  |  | 60 |  |
| `openai/gpt-image-2` |  |  | 6 | 16 |
| `openai/gpt-image-2.5-flare` |  |  | 12 | 16 |
| `openai/gpt-image-2.5-sunburst` |  |  | 12 | 16 |
| `prunaai/p-video` | 1–10s | 720p, 1080p |  | 1 |
| `tongyi-mai/z-image-turbo` |  |  | 60 |  |
| `x-ai/grok-imagine-image-2.0` |  | 1k, 2k |  | 3 |
| `x-ai/grok-imagine-video` | 1–15s |  |  | 1 |
| `x-ai/grok-imagine-video-1.5` | 1–15s | 720p, 480p, 1080p |  | 1 |

Regenerate by reading `shared/registry/text.ts` and `shared/registry/image.ts`.
When adding a model, prefer setting these fields on the registry entry so both
the API and this table stay honest.


