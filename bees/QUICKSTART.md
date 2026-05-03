# Bees quickstart

Goal: make a bee deploy feel like adding one new model to Pollinations. Keep
the first version boring.

## The smallest bee

Start with one manifest and two surfaces:

```json
{
  "name": "my-assistant",
  "source": {
    "type": "git",
    "repository": "https://github.com/me/my-assistant.git"
  },
  "surfaces": ["openai", "web"],
  "billing": { "mode": "author-pays" }
}
```

Defaults:

- missing `runtime` -> `worker + auto`
- missing `state.backend` -> `sqlite`
- `openai` -> available through regular `/v1/chat/completions`
- `web` -> a thin app/frontend over the same bee backend

## CLI path

```bash
polli bees init bee.json --name my-assistant
polli bees validate bee.json
polli bees deploy bee.json
```

`--dry-run` can exist for CI/debugging, but it should not be needed in the
happy-path quickstart.

Redeploy the same bee id explicitly:

```bash
polli bees deploy bee.json --upgrade
```

Use a container only when the bee needs shell, files, package installs, or a
long-running coding-agent workspace:

```bash
polli bees deploy bee.json --runtime daytona
```

## API path

Deploy/control plane:

```text
POST /api/bees
GET  /api/bees/{id}
GET  /api/bees/{id}/events
POST /api/bees?upgrade=1
```

Invocation should use the regular OpenAI-compatible API, not a new bee-specific
chat path:

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bee_my-assistant",
    "messages": [{ "role": "user", "content": "Help me plan this." }]
  }'
```

All bee calls require a key. The key is the payer context: author-pays bees
bill the bee owner, user-pays/BYOP bees bill the calling user/app key.

`/v1/models` can include bees available to the current key, the same way it can
already filter model availability by key restrictions.

## Incremental rollout

1. **Reference only** — keep PR #10636 as examples, docs, tests, and CLI/API
   contract. No production deploy path yet.
2. **One hardcoded prompt bee** — ship the minimal OpenAI wrapper first:
   system prompt + base model + `/v1/chat/completions`.
3. **Web frontend** — make the same bee power a tiny app shell, CatGPT-style.
4. **Worker runtime** — add hosted `worker + sqlite` deploys for simple bees.
5. **BYOP billing** — add user-pays once author-pays is stable.
6. **Container runtime** — add Daytona or AgentCore after one worker bee works
   end-to-end.
7. **More surfaces** — add A2A and Discord after OpenAI + web are boring.

## Two deploy types

- **Light bee:** serverless worker, SQLite state, no shell. This is the default.
- **Full bee:** container/runtime, filesystem/shell, explicit spend and teardown
  controls required before production.

Do not ask beginners to choose Cloudflare, Daytona, AgentCore, KV, Durable
Object, etc. The product choice is only light vs. full.

## Streaming

Streaming matters for agents, but the minimal rule is simple:

- if the caller sends `stream: true`, the bee streams SSE;
- model tokens can pass through directly;
- tool/step events can be optional `bee.step` chunks later;
- non-streaming bees must reject `stream: true` with a structured error.

Do not invent a workflow event protocol until plain token streaming works.

## Errors and costs

For OpenAI-compatible calls, keep the OpenAI shape:

```json
{
  "error": {
    "message": "Streaming is not supported by this bee.",
    "type": "invalid_request_error",
    "param": "stream",
    "code": "streaming_not_supported"
  }
}
```

Costs should stay close to OpenAI `usage`: normal token counts plus a
Pollinations extension listing underlying model/runtime costs. Avoid a big
`metadata.bee` object until a real caller needs it.

## YAGNI guardrails

- Do not make developers choose a provider on day one.
- Do not add a marketplace before deploy + invoke works.
- Do not add GitHub memory as runtime state; keep it archive/export only.
- Do not ship multiple framework variants in production docs.
- Do not add new billing scopes until one real deploy path needs them.
- Do not expose container deploys before spend limits and teardown exist.
- Do not expose `state.backend` in beginner docs. "Remember per user" is the
  product concept; SQLite/KV/DO is implementation detail.

## Questions to answer before building more

1. What is the exact bee model id format in `/v1/chat/completions`:
   `bee_my-assistant`, `bees/my-assistant`, or plain `my-assistant` scoped to
   the owner/app key?
2. Does `polli bees deploy` automatically publish that model id to `/v1/models`?
3. Is the first production bee author-pays only, to avoid BYOP complexity?
4. Is v1 memory just per-user SQLite conversation history?
5. Is `web` a generated thin frontend, or does deploy only return an API URL
   that an existing app uses?
6. What is the first proof app that should move to a bee backend?
7. What is the minimum useful streaming shape: token-only SSE, or token + tool
   step events?
8. What spend cap is required before any user-pays bee can run?
9. Can deploy be admin-only first, before exposing `bees:*` scopes to all
   developer keys?
10. Should full/container bees remain reference-only until provider teardown,
   cancellation, and logs are solved?
