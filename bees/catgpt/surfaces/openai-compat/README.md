# surfaces/openai-compat

OpenAI Chat Completions surface for CatGPT — the agent-as-model pattern. Mirrors how Polly is registered as a model today (`shared/registry/text.ts:861`).

Once mounted at a path like `/v1/chat/completions`, any OpenAI client can call CatGPT with `model: "catgpt"`:

```bash
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"catgpt","messages":[{"role":"user","content":"why are boxes magic?"}]}'
```

## Files

- `handler.ts` — `handleChatCompletions(req)` returning either a single ChatCompletion or an SSE stream of `chat.completion.chunk` events.
- `handler.test.ts` — 5 shape tests with a fetch stub. No network.

## What's standard

- `id`, `object: "chat.completion"`, `created`, `model`, `choices[0].message.{role,content}`, `finish_reason`, streaming `data: {...}\n\n` lines, terminating `data: [DONE]\n\n`.

## What's non-standard

- `choices[0].message.metadata.comic_url` — the generated webcomic URL. Off-spec but harmless to clients that ignore unknown fields. A future variant could surface it as a tool call instead.

## Why it lives in surfaces/

This is *the same surface across implementations*. It only depends on `core/`. Each runtime variant under `implementations/` could mount this handler — they don't need their own copy.
