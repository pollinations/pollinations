## Retrying timed-out requests

If your client or proxy times out, send the exact same request again. Keep the endpoint, body, query parameters, and seed unchanged.

The generation continues after the connection closes. The retry waits for the generation already in progress or receives the completed cached result, instead of starting another generation. Only the generation is billed; retries and cache hits are not.

This applies to non-streaming `/v1/chat/completions` and `/text`, `/v1/images/generations`, and the cache-backed `GET` text, image, video, audio, and 3D routes. Streaming text and uncached endpoints run independently.
