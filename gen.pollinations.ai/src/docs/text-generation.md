## Text Generation

Generate text using OpenAI-compatible Chat Completions and stateless Responses APIs — use an OpenAI SDK by changing the base URL.

| Endpoint | Best for |
|----------|----------|
| `POST /v1/chat/completions` | Full OpenAI compatibility — streaming, tools, vision, structured outputs |
| `POST /v1/responses` | Stateless Responses input/output items, semantic streaming events, and function tools |
| `POST /v1/messages` | Anthropic Messages protocol — Claude Code and the official Anthropic SDKs |
| `GET /text/{prompt}` | Quick prototyping — simple GET, returns plain text |

**Available models:** {{TEXT_MODELS}}

### Anthropic Messages API

Claude Code, the official Anthropic SDKs, and any tool that speaks Anthropic's Messages API can use Pollinations text models directly — no router in between. Every model that serves `/v1/chat/completions` also serves `/v1/messages` and lists it in `supported_endpoints`. Media models return a clear 400.

Claude Code needs only three variables:

```bash
export ANTHROPIC_BASE_URL=https://gen.pollinations.ai
export ANTHROPIC_AUTH_TOKEN=sk_...          # your Pollinations secret key
export ANTHROPIC_MODEL=<a text model id>    # e.g. openai
```

The official SDKs use the same base URL with `base_url` and `auth_token`:

```python
from anthropic import Anthropic

client = Anthropic(base_url="https://gen.pollinations.ai", auth_token="sk_...")
msg = client.messages.create(
    model="openai",
    max_tokens=128,
    messages=[{"role": "user", "content": "Explain why the sky is blue."}],
)
print(msg.content[0].text)
```

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  baseURL: "https://gen.pollinations.ai",
  apiKey: "sk_...",
});
const message = await client.messages.create({
  model: "openai",
  max_tokens: 128,
  messages: [{ role: "user", content: "Explain why the sky is blue." }],
});
console.log(message.content);
```

Plain, streamed, tool-use and image requests all work. Streaming follows the standard Messages event order (`message_start`, `content_block_start`/`delta`/`stop`, `message_delta`, `message_stop`); `ping` events keep long silent reasoning stretches from tripping client timeouts. Tool calls arrive as `tool_use` blocks and tool results are sent back as `tool_result` blocks. Provider reasoning is returned as `thinking` blocks. `cache_control` prompt caching, stop sequences, system prompts and images behave as on `/v1/chat/completions`.

Billing matches Chat Completions: one charge per request, with input, output, cache-read and cache-write tokens reported in Anthropic's `usage` fields. A response without provider usage fails instead of going unbilled. Errors use Anthropic's shape and status codes — `401 authentication_error`, `402 billing_error`, `429 rate_limit_error` (with an integer `retry-after`) — so SDK retries and Claude Code's error handling work as expected.

Out of scope on this endpoint: `/v1/messages/count_tokens`, batches, files, Anthropic server tools, and `x-api-key` auth (use `Authorization: Bearer`, which Claude Code sends via `ANTHROPIC_AUTH_TOKEN` and the SDKs via `auth_token`).


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

The endpoint is deliberately stateless. `store` must be `false`; `previous_response_id`, `conversation`, and `prompt` must be null or omitted; `background` must be false or omitted; and encrypted content or reusable item references are rejected. Streaming uses Responses event names and terminal usage events. Direct models preserve the provider's terminal marker; managed-agent streams add one `data: [DONE]` marker. For text models, missing or malformed usage on a completed or incomplete response fails the request. Failed responses may report null usage. These failed requests are not billed, but completed child model calls and charged MCP operations within an agent run remain billable; the outer agent request adds no charge.

The stateless surface follows the OpenAI Responses API and OpenResponses item/event vocabulary. It does not claim full OpenResponses conformance: persisted continuation, conversations, compaction, background jobs, Responses WebSocket transport, and normalization of every direct provider stream are outside this subset.

Community text models and endpoint agents declare one upstream API and one exact URL. A Responses registration accepts both public APIs: Responses requests use the selected endpoint directly, while Chat Completions requests use the shared stateless adapter. A Chat Completions registration accepts Chat Completions only. Built-in models can have separate routes for the two public APIs; advertising Responses does not mean their Chat requests use the adapter.

Managed prompt agents run configured MCP tools on the server. Send previous response items back to continue a conversation; completed tools are not run again.

Managed prompt agents accept `reasoning.effort` (Responses) and `reasoning_effort` (Chat Completions). Reasoning summaries are not supported: a non-null `reasoning.summary` returns HTTP 400.

### Media models in conversations

Image, video, audio and 3D models that advertise these endpoints in [`/models`](/models) accept a text prompt. Only the last user message is used; history, instructions and text-generation settings are ignored. Its text parts (or a string Responses `input`) form the prompt. Image parts (`image_url` in Chat, `input_image` in Responses, as URLs or data URIs) are the source images of image models and the start frame of video models that list `image` under `input_modalities`, exactly as `/v1/images/edits` does; other models, including 3D, return HTTP 400 for them, and any other attachment type returns HTTP 400. Use the native media endpoints for generation settings.

Text models with `video` under `input_modalities` (for example `inclusionai/ling-3.0-flash-vl`) accept `video_url` parts the same way they accept `image_url`: a public `https://` URL or a `data:video/...;base64,...` data URI (Gemini models also accept YouTube and `gs://` URLs). Video usage is metered from the provider's reported `video_tokens` detail and billed against the model's video prompt rate.

Empty prompts, malformed Unicode and prompts consisting only of `.` or `..` return HTTP 400. Reference-required models return their normal missing-input error.

Dialogue models expect one `<voice>: <text>` turn per line, just like `/audio`. Community speech models available only through `/v1/audio/speech` are not included.

```bash
curl https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"flux","input":"A lighthouse at dawn"}'

curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"flux","messages":[{"role":"user","content":"A lighthouse at dawn"}]}'
```

Both return assistant text: a Markdown image embed for images, or a Markdown link for audio, video and 3D, followed by the plain public file URL. The URL is also in the `Link` header. With `stream: true`, events arrive after generation finishes.

Media uses its normal billing units, not text tokens: Responses returns `usage: null`; Chat JSON omits `usage`. Chat streaming chunks contain `usage: null`, with no final usage chunk. Video uses the native model or provider's default duration.

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
  "model": "google/gemini-2.5-flash-lite",
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

**Gemini** — the prefix must be at least ~2,048 tokens (~4,096 on Gemini 3 models). Requests with tools are not cached — including built-in tools, so `google/gemini-3.7-flash`, `google/gemini-3-flash-preview`, `google/gemini-3.1-pro-preview`, and the search variants only cache when tools are disabled (`"tools": []`) or a JSON `response_format` is set; `google/gemini-2.5-flash-lite` and `google/gemini-3.5-flash-lite` cache by default. Cache creates bill at the standard input rate plus a storage fee for the 1-hour TTL ($1 per 1M cached tokens on Flash models, $4.50 on Pro); hits bill at ~10% of input. The storage fee means caching pays off only when the prefix is reused often — roughly a dozen reuses per hour on the cheapest models.

**Claude** — all Claude models cache. The prefix minimum varies by model: 512 tokens on `anthropic/claude-fable-5`, `anthropic/claude-fable-5.1`, and `anthropic/claude-opus-5`, and 1,024 on `anthropic/claude-sonnet-4.6`; other models have higher minimums. Tool definitions are cacheable. `anthropic/claude-fable-5.1` accepts only automatic or disabled tool choice; forcing any or a named tool returns a 400. Cache creates bill at 1.25× the input rate (no storage fee); hits bill at 10% of input, or 2.5% on `anthropic/claude-fable-5.1`. The cache lives ~5 minutes, refreshed on each hit.

**Nova** — `nova` and `nova-fast` cache. The prefix must be at least ~1,000 tokens (up to 20K tokens cacheable). Cache creates are free; hits bill at 25% of input. ~5-minute TTL.

Models that advertise `/v1/responses` also accept OpenAI's cache controls. Set `prompt_cache_options.mode` to `explicit` and place `prompt_cache_breakpoint: { "mode": "explicit" }` on the content block ending each stable prefix (up to four). Chat requests adapted to Responses preserve these markers; the existing `cache_control: { "type": "ephemeral" }` marker is translated to the same explicit breakpoint. Managed prompt agents apply an explicit request without caller markers to their configured static prompt.

### Typed decisions (`typesafe/jev-1.13`)

`typesafe/jev-1.13` (aliases `jev` and `typesafe/jev`) returns calibrated judgments instead of free text. Post `state` and a map of `questions` to `POST /alpha/decisions`; each question is a `choice`, `score`, or `noul`, and each is answered independently under the key you supplied. `model` defaults to `jev`.

```json
{
  "state": "My payouts have been failing for 3 days.",
  "questions": {
    "department": {
      "type": "choice",
      "instructions": "Which team should handle this?",
      "criteria": { "billing": "Payment issues", "technical": "Product failures" }
    },
    "is_urgent": { "type": "noul", "instructions": "Does this convey urgency?" }
  }
}
```

The response carries `answers`, one field per question, each with `type` and its native fields (`choice` + `confidence` + `probabilities`, `score` + `legend` + `confidence` + `probabilities`, or `noul`), plus `usage` with `input_tokens` and `output_tokens`. See the [TypeSafe API reference](https://docs.typesafe.ai/api) for the native request and answer shapes.

```json
{
  "id": "dec-…",
  "model": "typesafe/jev-1.13",
  "provider": "TypeSafe",
  "answers": {
    "department": {
      "type": "choice",
      "choice": "billing",
      "confidence": 0.82,
      "probabilities": { "billing": 0.91, "technical": 0.09 }
    },
    "is_urgent": { "type": "noul", "noul": 0.87 }
  },
  "usage": { "input_tokens": 312, "output_tokens": 48 }
}
```

`state`, `instructions`, and criteria values accept a string or arbitrary JSON. There is no streaming; the answers arrive in one response.

The same model is also reachable from an OpenAI client on `/v1/chat/completions`: put the identical request JSON in the last `user` message as a string, and the answers come back as `message.content`. Earlier turns, system instructions, and text-generation settings are ignored. With `stream: true` the finished answers arrive as one content chunk followed by the usage chunk. Prefer `/alpha/decisions` where you can post the native shape.

Supply relevant facts in `state`; Jev can be confident even when facts are missing. Interpret scores using `legend`, and handle counting, arithmetic, and date comparisons in code. Questions are evaluated independently.

The context limit is 64k tokens for `state` and all questions together, and 32k for `state` plus the longest question.
