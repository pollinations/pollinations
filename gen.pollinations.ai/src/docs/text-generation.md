## Text Generation

Generate text responses using AI models. Fully compatible with the OpenAI Chat Completions API — use any OpenAI SDK by changing the base URL.

| Endpoint | Best for |
|----------|----------|
| `POST /v1/chat/completions` | Full OpenAI compatibility — streaming, tools, vision, structured outputs |
| `GET /text/{prompt}` | Quick prototyping — simple GET, returns plain text |

**Available models:** {{TEXT_MODELS}}

### Prompt caching

On Gemini, Claude, and Nova models, a large static prompt prefix can be cached so repeat requests bill it at a fraction of the input rate. Mark the end of the static prefix with `cache_control` on a content block (not on the message); everything before the marker must be byte-identical across requests, everything dynamic goes after. The first request creates the cache (`usage` reports `cache_creation_input_tokens`); repeat requests within the TTL report `prompt_tokens_details.cached_tokens` at the discounted rate.

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

**Gemini** — the prefix must be at least ~2,048 tokens (~4,096 on Gemini 3 models). Requests with tools are not cached — including built-in tools, so `gemini`, `gemini-3-flash`, `gemini-large`, and the search variants only cache when tools are disabled (`"tools": []`) or a JSON `response_format` is set; `gemini-fast` and `gemini-flash-lite-3.1` cache by default. Cache creates bill at the standard input rate plus a storage fee for the 1-hour TTL ($1 per 1M cached tokens on Flash models, $4.50 on Pro); hits bill at ~10% of input. The storage fee means caching pays off only when the prefix is reused often — roughly a dozen reuses per hour on the cheapest models.

**Claude** — all Claude models cache. The prefix must be at least 4,096 tokens (1,024 on `claude` and `claude-fable-5`); tools are fine. Cache creates bill at 1.25× the input rate (no storage fee); hits bill at 10% of input. The cache lives ~5 minutes, refreshed on each hit.

**Nova** — `nova` and `nova-fast` cache. The prefix must be at least ~1,000 tokens (up to 20K tokens cacheable). Cache creates are free; hits bill at 25% of input. ~5-minute TTL.
