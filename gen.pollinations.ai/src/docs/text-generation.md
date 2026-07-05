## Text Generation

Generate text responses using AI models. Fully compatible with the OpenAI Chat Completions API — use any OpenAI SDK by changing the base URL.

| Endpoint | Best for |
|----------|----------|
| `POST /v1/chat/completions` | Full OpenAI compatibility — streaming, tools, vision, structured outputs |
| `GET /text/{prompt}` | Quick prototyping — simple GET, returns plain text |

**Available models:** {{TEXT_MODELS}}

### Prompt caching

On Gemini models, a large static prompt prefix can be cached so repeat requests bill it at ~10% of the input rate. Mark the end of the static prefix with `cache_control` on a content block (not on the message); everything before the marker must be byte-identical across requests, everything dynamic goes after.

```json
{
  "model": "gemini-fast",
  "messages": [
    {
      "role": "system",
      "content": [
        {
          "type": "text",
          "text": "<large static prompt>",
          "cache_control": { "type": "ephemeral" }
        }
      ]
    },
    { "role": "user", "content": "<dynamic message>" }
  ]
}
```

- The static prefix must be at least ~2048 tokens. Requests with tools are not cached — including built-in tools, so `gemini`, `gemini-3-flash`, `gemini-large`, and the search variants only cache when tools are disabled with `"tools": []`. `gemini-fast` and `gemini-flash-lite-3.1` cache by default.
- The first request creates the cache — `usage` reports `cache_creation_input_tokens`, billed at the standard input rate plus a storage fee for the 1-hour TTL ($1 per 1M cached tokens on Flash models, $4.50 on Pro). Requests within the TTL report `prompt_tokens_details.cached_tokens` at the discounted rate.
- Caching pays off when the prefix is reused often — on the cheapest models the storage fee outweighs the discount below roughly a dozen reuses per hour.
