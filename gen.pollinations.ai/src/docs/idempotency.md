## Idempotency and timeouts

Cache-backed generation requests are idempotent while the result remains cached. Identical requests share one in-progress generation and later receive the same completed result. Only the generated result is billed; joined requests and cache hits are not.

The API keeps the request open until generation finishes. If your client or proxy times out, retry the exact same request: keep the endpoint, body, query parameters, and seed unchanged. The generation continues after the connection closes, so the retry joins it while it is running or receives the cached result after completion.

This applies to non-streaming `/v1/chat/completions` and `/text`, `/v1/images/generations`, and the cache-backed `GET` text, image, video, audio, and 3D routes. Streaming text and uncached endpoints run independently.

| `X-Cache-Type` | Meaning |
|----------------|---------|
| `GENERATED` | This request started the generation |
| `COALESCED` | This request joined an in-progress generation |
| `EXACT` | The completed result was already cached |
