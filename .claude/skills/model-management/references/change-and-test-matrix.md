# Model change and E2E matrix

Every change starts with the confirmation gate in `SKILL.md`. Test the exact configured route with real provider requests and then through local Gen.

## Change matrix

| Change | Required verification |
|---|---|
| Add model | Full declared-modality matrix, aliases, permissions, provider price, billing audit, cache, errors, burst, catalog entry, description, logo |
| Provider or upstream model ID | Full declared-modality matrix, every previously supported capability, params, price, usage fields, cache, errors, latency, quotas, provider-managed fallback |
| Price or multiplier | Official exact-route price, one real request per declared modality, usage headers/body, billing row, displayed price, no missing conversion |
| Canonical name or alias | Audit every registry plus model changes between production and `main`; count stored aliases in production and staging; when non-zero, merge the D1 migration before the registry rename and promote a revision containing both so D1 runs immediately before the Worker; verify all old-ID counts reach zero, API-key create/update writes aliases canonically while preserving unknown/community IDs, restricted keys retain access, catalogs display canonical permissions, and removed IDs return model-not-found when no alias was approved |
| Description or brand | Catalog returns developer-facing copy without the title; brand mapping resolves to a real SVG; `addedDate` unchanged |
| Input/output modality | Real sample proves the modality; unsupported inputs fail clearly; matching usage field is billed |
| Image size/aspect/format | Every supported value returns the claimed dimensions/format; unsupported values are 4xx |
| Video duration/resolution/fps/audio | Every supported combination needed by the public contract is verified with media inspection and exact billing |
| Voice/format/timestamps/dialogue | Every advertised voice and output mode is called through its public endpoint and media integrity is checked |
| `paidOnly` | No-pack account is rejected and pack-funded account succeeds; catalog visibility/permissions match |
| Remove model | Remove registry/config/handler code that has no remaining consumer; catalog omits it; canonical and aliases return model-not-found; search for orphan references |

## Text, reasoning, coding, and vision

Test every claimed capability:

- non-streaming and streaming completion, including finish reason and final stream marker
- small `max_tokens` edge
- system/user/assistant messages and any supported JSON/structured output
- tool call and valid tool arguments
- reasoning usage when advertised
- image input and multiple images when advertised; the answer must demonstrate it saw the image
- native search or code execution when advertised, including provider charges
- prompt caching with the same sufficiently long prefix twice
- canonical ID and every alias

Do not advertise a capability because the base model supports it if the selected provider route drops or rewrites it.

## Image and editing

- Text-to-image basic generation and media integrity.
- Every supported aspect ratio, size, quality, format, transparency, and seed behavior.
- Image editing with minimum, maximum, and multiple reference images when advertised.
- Unsupported parameters and invalid image inputs return useful 4xx errors.
- Two byte-identical requests prove the expected cache behavior.
- Complete output arrives within the synchronous latency budget.

## Video

- Text-to-video and image-to-video/start/end frames as advertised.
- Every public duration, resolution, aspect ratio, fps, and audio option.
- Inspect the returned container, dimensions, duration, and audio stream.
- Validate provider polling and terminal failure handling without exposing an async job to the user.
- Run repeated generations to measure typical and slow-tail latency; require completion within the supported synchronous budget.
- Verify resolution/duration-specific billing rather than assuming one flat media price.

## Durable long-running media

For any media route that may exceed 120 seconds:

- Disconnect the original client and retry the byte-identical request. The retry must join the running job rather than start a second upstream execution.
- After completion, retry again and verify retrieval from the completed R2 cache with an intact response.
- Verify exactly one wallet debit and one billed Tinybird event across the original request, running-job join, and completed-cache retrieval.
- Exercise durations just below, at, and above 300 seconds. Requests within the boundary must complete; requests beyond it must terminate clearly unless a separately approved asynchronous public contract exists.
- Keep provider polling internal. Do not expose provider job IDs or require user polling under the synchronous public contract.

## Audio, speech, and music

- TTS through every advertised public endpoint, with every declared voice and format.
- Inspect container/header integrity and duration; listen when voice distinction matters.
- Test timestamps, dialogue, speech-to-speech, voice isolation, or other specialized surfaces only when advertised.
- STT uses real audio, returns accurate text, and bills input duration/units.
- Music generation returns valid audio at the requested length and bills the exact output duration/units.
- Realtime voice requires a separate session-level E2E covering connection, input, output, metering, termination, and timeouts.

## Embeddings and reranking

- Single input and batch input.
- Vector count and declared dimensions.
- Token usage scaling and exact price.
- Oversized input returns 4xx.
- Reranking verifies result ordering, document indices, limits, and billed units.

## OCR, SVG/vector, 3D, and specialist models

- Exercise every advertised input type and output format.
- Verify response content type, filename/extension, structure, and usability—not just status 200.
- For OCR, test PDF and image inputs, page selection, structured blocks, and large-payload behavior when exposed.
- For SVG/vector output, validate parseability and render the result.
- For 3D, inspect the actual asset type and any preview; do not label PLY, splats, or point clouds as GLB meshes.
- Run multiple timed media jobs; do not add a specialist model that routinely exceeds the supported request-lifetime budget.

## Errors, permissions, cache, and capacity

- Invalid URL, malformed input, unsupported parameter, oversized prompt/file, invalid tool schema, and safety rejection must return useful 4xx responses rather than opaque 5xx responses.
- Verify paid-only access with the correct balance types.
- For caches, test a real MISS followed by a byte-identical HIT and understand whether usage headers and billing rows are expected on each.
- Sample current production peak before choosing burst concurrency. Run cache-busted bursts at expected load and document 429s, 5xx responses, and latency. Zero unexplained 5xx responses is the acceptance gate.
