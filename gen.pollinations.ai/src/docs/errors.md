## Errors

Pollinations HTTP errors usually include a status and a machine-readable `error.code`.

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
| `400` | Invalid parameters, malformed request, or an explicit output-token limit exhausted without an answer (`output_token_limit_exceeded`) |
| `401` | Missing or invalid API key |
| `402` | Key budget or account balance cannot cover the request |
| `403` | API key lacks required permission |
| `404` | Unknown path or resource, such as a file or sandbox (an unknown model returns `400`) |
| `422` | Content policy violation |
| `429` | Rate limited; wait for `Retry-After` when present |
| `500` | Internal server error |
| `502` / `503` | Upstream provider failed or is unavailable; safe to retry |

### Budget and balance errors

Requests refused before generation incur no charge. Read `error.message` for the reason and open `error.fixUrl` to resolve it. A key can see its own remaining budget. Account amounts in HTTP errors require `account:usage` on the key.

| `error.code` | What to do |
|---|---|
| `KEY_BUDGET_EXHAUSTED` | Increase the key budget. If another request holds a reservation, retry when it finishes. |
| `INSUFFICIENT_BALANCE` | Either the Quest balance or the paid balance must cover the estimate on its own. Paid-only models require paid balance. |
| `QUEST_POLLEN_ONLY` | Allow this key to use paid balance, or earn Quest balance if the model accepts it. |
| `QUEST_POLLEN_RESTRICTED` | Unlock the Quest balance with a first purchase, or contact `hello@pollinations.ai`. |

For text output, budget errors can appear as a chat reply with zero usage. Structured JSON and audio requests retain the HTTP error.

A realtime provider can return its own HTTP status and body when it refuses a WebSocket upgrade. Browsers hide this response from the WebSocket client.

### Output token limits and billing

Non-streaming Chat Completions and Chat-adapted Responses return `400 output_token_limit_exceeded` when the caller supplied a token limit and every choice is empty with `finish_reason: "length"`. Messages returns the same guidance as `400 invalid_request_error`. Increase `max_tokens`, `max_completion_tokens`, or `max_output_tokens`, as appropriate, or reduce reasoning effort before retrying.

This error is billed from provider-reported usage, including input and reasoning tokens, even though no answer was produced. It does not trigger provider fallback and is not cached; a retry starts a new generation and can incur another charge. If the caller omitted the token limit, an empty response remains a retryable `502 empty_response`. Responses containing an answer, tool call, refusal, or media retain their normal response.

### Timeouts and retries

If your client or proxy times out, send the exact same request again. Keep the endpoint, body, query parameters, and seed unchanged.

The generation continues after the connection closes. The retry waits for the generation already in progress or receives the completed cached result, instead of starting another generation. Only the generation is billed; retries and cache hits are not.

This applies to cache-backed, non-streaming text, embedding, image, video, 3D, audio, and transcription requests, including the OpenAI-compatible endpoints. Streaming text and uncached endpoints run independently.
