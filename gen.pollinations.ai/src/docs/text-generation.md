## Text Generation

Generate text using OpenAI-compatible Chat Completions and stateless Responses APIs — use an OpenAI SDK by changing the base URL.

| Endpoint | Best for |
|----------|----------|
| `POST /v1/chat/completions` | Full OpenAI compatibility — streaming, tools, vision, structured outputs |
| `POST /v1/responses` | Stateless Responses input/output items, semantic streaming events, and function tools |
| `GET /text/{prompt}` | Quick prototyping — simple GET, returns plain text |

**Available models:** {{TEXT_MODELS}}

### Responses API

Use `supported_endpoints` from [`GET /v1/models`](/v1/models) or [`GET /text/models`](/text/models) to find models that advertise `/v1/responses`. This includes configured built-in providers, community text models with an exact Responses URL, external endpoint agents with an exact Responses URL, and managed prompt agents.

```bash
curl https://gen.pollinations.ai/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -d '{
    "model": "openai",
    "input": "Explain why the sky is blue in two sentences.",
    "store": false
  }'
```

The endpoint is deliberately stateless. `store` must be `false`; `previous_response_id`, `conversation`, and `prompt` must be null or omitted; `background` must be false or omitted; and encrypted content or reusable item references are rejected. Streaming uses Responses event names and terminal usage events. Direct models preserve the provider's terminal marker; managed-agent streams add one `data: [DONE]` marker. Missing or malformed usage on a completed or incomplete response fails closed and is not billed; failed responses may report null usage and remain unbilled.

The stateless surface follows the OpenAI Responses API and OpenResponses item/event vocabulary. It does not claim full OpenResponses conformance: persisted continuation, conversations, compaction, background jobs, Responses WebSocket transport, and normalization of every direct provider stream are outside this subset.

Community text models and endpoint agents declare one upstream API and one exact URL. A Responses registration accepts both public APIs: Responses requests use the selected endpoint directly, while Chat Completions requests use the shared stateless adapter. A Chat Completions registration accepts Chat Completions only. Built-in models can have separate routes for the two public APIs; advertising Responses does not mean their Chat requests use the adapter.

Managed prompt agents use Pollinations' configured Responses runtime and have no publisher-configured endpoint URL. Their configured MCP tools remain available; caller-supplied function tool definitions are ignored.

### Reasoning

Use `reasoning_effort` to control reasoning on models that advertise reasoning support.

```bash
# POST /v1/chat/completions — OpenAI-compatible response
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -d '{
    "model": "openai",
    "reasoning_effort": "high",
    "messages": [
      { "role": "user", "content": "Prove that there are infinitely many prime numbers." }
    ]
  }'
```

```bash
# POST /text — plain-text response
curl https://gen.pollinations.ai/text \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -d '{
    "model": "openai",
    "reasoning_effort": "medium",
    "messages": [
      { "role": "user", "content": "Design a URL shortener. Outline the key tradeoffs." }
    ]
  }'
```

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

**Gemini** — the prefix must be at least ~2,048 tokens (~4,096 on Gemini 3 models). Requests with tools are not cached — including built-in tools, so `gemini`, `gemini-3-flash`, `gemini-large`, and the search variants only cache when tools are disabled (`"tools": []`) or a JSON `response_format` is set; `gemini-fast` and `gemini-flash-lite-3.5` cache by default. Cache creates bill at the standard input rate plus a storage fee for the 1-hour TTL ($1 per 1M cached tokens on Flash models, $4.50 on Pro); hits bill at ~10% of input. The storage fee means caching pays off only when the prefix is reused often — roughly a dozen reuses per hour on the cheapest models.

**Claude** — all Claude models cache. The prefix minimum varies by model: 512 tokens on `claude-fable-5`, `anthropic/claude-fable-5.1`, and `claude-opus-5`, and 1,024 on `claude`; other models have higher minimums. Tool definitions are cacheable. `anthropic/claude-fable-5.1` accepts only automatic or disabled tool choice; forcing any or a named tool returns a 400. Cache creates bill at 1.25× the input rate (no storage fee); hits bill at 10% of input, or 2.5% on `anthropic/claude-fable-5.1`. The cache lives ~5 minutes, refreshed on each hit.

**Nova** — `nova` and `nova-fast` cache. The prefix must be at least ~1,000 tokens (up to 20K tokens cacheable). Cache creates are free; hits bill at 25% of input. ~5-minute TTL.

Models that advertise `/v1/responses` also accept OpenAI's cache controls. Set `prompt_cache_options.mode` to `explicit` and place `prompt_cache_breakpoint: { "mode": "explicit" }` on the content block ending each stable prefix (up to four). Chat requests adapted to Responses preserve these markers; the existing `cache_control: { "type": "ephemeral" }` marker is translated to the same explicit breakpoint. Managed prompt agents apply an explicit request without caller markers to their configured static prompt.
