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

- `handler.ts` — `handleChatCompletions(req)` returning either a single ChatCompletion, an SSE stream of `chat.completion.chunk` events, a discovery JSON, or a structured error.
- `handler.test.ts` — 12 shape tests with a fetch stub. No network.

## What's standard

- `id`, `object: "chat.completion"`, `created`, `model`, `choices[0].message.{role,content}`, `finish_reason`, streaming `data: {...}\n\n` lines, terminating `data: [DONE]\n\n`.

## What's non-standard

- `choices[0].message.metadata.comic_url` — the generated webcomic URL. Off-spec but harmless to clients that ignore unknown fields. A future variant could surface it as a tool call instead.

## Discovery (`GET /` or `GET /v1/chat/completions`)

A caller pasting the URL into a browser sees a JSON like this:

```json
{
  "name": "CatGPT",
  "description": "Aloof sarcastic cat that answers in 2-8 words ...",
  "endpoints": {
    "chat": "https://.../v1/chat/completions",
    "web": "https://.../web/messages",
    "a2a": "https://.../a2a",
    "agent_card": "https://.../.well-known/agent-card.json"
  },
  "auth": "optional_pk",
  "try": "curl -X POST https://.../v1/chat/completions -H 'content-type: application/json' -d '{\"messages\":[{\"role\":\"user\",\"content\":\"why?\"}]}'"
}
```

Single biggest discoverability win — caller copies the `try` curl, pastes, gets a working response. Mirrors the friction-research B3 recommendation.

## Errors (structured 400/405)

All error responses use the same envelope:

```json
{ "error": { "code": "...", "message": "...", "hint": "..." } }
```

| code                  | status | when                                                |
|-----------------------|--------|-----------------------------------------------------|
| `method_not_allowed`  | 405    | request method is not GET/POST                      |
| `invalid_json`        | 400    | request body is not valid JSON                      |
| `invalid_request`     | 400    | request body is not a JSON object                   |
| `missing_messages`    | 400    | `messages` field is absent or not an array          |
| `empty_messages`      | 400    | `messages` is an empty array                        |
| `no_user_message`     | 400    | `messages` contains only system/assistant turns     |

`hint` is always actionable — a copyable next step, not just an apology. Mirrors the friction-research B5 recommendation (never leak stack traces; always give the caller something to do).

## Why it lives in surfaces/

This is *the same surface across implementations*. It only depends on `core/`. Each runtime variant under `implementations/` could mount this handler — they don't need their own copy.
