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
| `402` | The key budget or spendable account balance cannot cover the request. See the codes below. |
| `403` | API key lacks required permission |
| `404` | Unknown path or resource, such as a file or sandbox (an unknown model returns `400`) |
| `422` | Content policy violation |
| `429` | Rate limited; wait for `Retry-After` when present |
| `500` | Internal server error |
| `502` / `503` | Upstream provider failed or is unavailable; safe to retry |

### Budget and balance errors

For a generation request refused before it starts, no charge is made. Read `error.message` for the reason and `error.fixUrl` for the page where the account owner can resolve it.

| `error.code` | What to do |
|---|---|
| `KEY_BUDGET_EXHAUSTED` | Increase this key’s remaining budget. If another request reserved it, retry after that request finishes. Adding funds to the account leaves the key’s spending limit in place. |
| `INSUFFICIENT_BALANCE` | For models that accept Quest funds, either the Quest balance or the paid balance must cover the estimate on its own. For a paid-only model, add funds to the paid balance. |
| `QUEST_POLLEN_ONLY` | This key can spend only Quest funds. Allow the key to use paid funds, or earn more Quest funds if the model accepts them. |
| `QUEST_POLLEN_RESTRICTED` | The account’s Quest balance is locked. Follow the purchase link or contact `hello@pollinations.ai` for help. |

For ordinary text output, the API can deliver this guidance as a chat response with zero usage. Requests for structured JSON or audio retain the HTTP error.

On a realtime WebSocket upgrade, Pollinations returns a budget refusal as HTTP 402 before the session starts. If the upstream provider rejects the handshake, its HTTP status and response body can pass through directly. Browser WebSocket clients do not expose the HTTP response body for a failed upgrade.

### Output token limits and billing

Non-streaming Chat Completions and Chat-adapted Responses return `400 output_token_limit_exceeded` when the caller supplied a token limit and every choice is empty with `finish_reason: "length"`. Messages returns the same guidance as `400 invalid_request_error`. Increase `max_tokens`, `max_completion_tokens`, or `max_output_tokens`, as appropriate, or reduce reasoning effort before retrying.

This error is billed from provider-reported usage, including input and reasoning tokens, even though no answer was produced. It does not trigger provider fallback and is not cached; a retry starts a new generation and can incur another charge. If the caller omitted the token limit, an empty response remains a retryable `502 empty_response`. Responses containing an answer, tool call, refusal, or media retain their normal response.

### Timeouts and retries

If your client or proxy times out, send the exact same request again. Keep the endpoint, body, query parameters, and seed unchanged.

The generation continues after the connection closes. The retry waits for the generation already in progress or receives the completed cached result, instead of starting another generation. Only the generation is billed; retries and cache hits are not.

This applies to cache-backed, non-streaming text, embedding, image, video, 3D, audio, and transcription requests, including the OpenAI-compatible endpoints. Streaming text and uncached endpoints run independently.
