# surfaces/web-chat

Plain SSE web chat surface. The simplest streaming surface a browser can consume — no SDK, no special wire format, just `EventSource`.

## Endpoints

- `POST /chat` — non-streaming, returns `{reply, comicUrl}`.
- `POST /chat?stream=1` — SSE.

## SSE event types

| event | payload | when |
|---|---|---|
| `reply` | `{"text":"<word>"}` | once per word of the cat's reply |
| `comic` | `{"url":"https://gen.pollinations.ai/image/..."}` | after the reply, before done |
| `done`  | `{}` | terminator |

## Browser side (vanilla)

```html
<script>
  const res = await fetch('/chat?stream=1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'why are boxes magic?' }),
  });
  // EventSource doesn't support POST; for a real implementation use a small
  // SSE parser over the fetch body. This handler emits standard SSE so any
  // parser works.
</script>
```

## Files

- `handler.ts` — `handleChatRequest(req)`. Mountable into Worker / Node / Bun / hono.
- `handler.test.ts` — 4 shape tests with a fetch stub. No network.

## Why it lives in surfaces/

Same reasoning as `openai-compat` and `a2a` — the implementation is the same code regardless of which variant is hosting it.
