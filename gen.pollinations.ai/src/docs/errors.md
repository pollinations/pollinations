## Errors

All errors return JSON with a consistent shape:

```json
{
  "status": 400,
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Description of what went wrong"
  }
}
```

| Status | Meaning |
|--------|---------|
| `400` | Invalid parameters or malformed request |
| `401` | Missing or invalid API key |
| `402` | Insufficient pollen balance, key budget exhausted, or model needs paid Pollen (`INSUFFICIENT_BALANCE`, `KEY_BUDGET_EXHAUSTED`, `QUEST_POLLEN_ONLY`) |
| `403` | API key lacks required permission |
| `404` | Model or resource not found |
| `422` | Content policy violation |
| `429` | Rate limited; wait for `Retry-After` when present |
| `500` | Internal server error |
| `502` / `503` | Upstream provider failed or is unavailable; safe to retry |

### Timeouts and retries

If your client or proxy times out, send the exact same request again. Keep the endpoint, body, query parameters, and seed unchanged.

The generation continues after the connection closes. The retry waits for the generation already in progress or receives the completed cached result, instead of starting another generation. Only the generation is billed; retries and cache hits are not.

This applies to cache-backed, non-streaming text, embedding, image, video, 3D, audio, and transcription requests, including the OpenAI-compatible endpoints. Streaming text and uncached endpoints run independently.
