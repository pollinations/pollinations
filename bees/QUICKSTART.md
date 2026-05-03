# Bees quickstart

Goal: make a bee deploy feel like deploying a tiny OpenAI-compatible agent.
Keep the first version boring.

## The smallest bee

Start with one manifest and one surface:

```json
{
  "name": "my-assistant",
  "source": {
    "type": "git",
    "repository": "https://github.com/me/my-assistant.git"
  },
  "surfaces": ["openai"],
  "billing": { "mode": "author-pays" }
}
```

Defaults:

- missing `runtime` -> `worker + auto`
- missing `state.backend` -> `sqlite`
- `openai` -> `/bees/{id}/v1/chat/completions`

## CLI path

```bash
polli bees init bee.json --name my-assistant
polli bees validate bee.json
polli bees deploy bee.json --dry-run
polli bees deploy bee.json
```

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

```text
POST /api/bees
GET  /api/bees/{id}
GET  /api/bees/{id}/events
POST /api/bees?upgrade=1
```

Invocation stays OpenAI-compatible:

```bash
curl https://gen.pollinations.ai/bees/bee_my-assistant/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "my-assistant",
    "messages": [{ "role": "user", "content": "Help me plan this." }]
  }'
```

## Incremental rollout

1. **Reference only** — keep PR #10636 as examples, docs, tests, and CLI/API
   contract. No production deploy path yet.
2. **One hardcoded prompt bee** — ship the minimal OpenAI wrapper first:
   system prompt + base model + `/v1/chat/completions`.
3. **Worker runtime** — add hosted `worker + sqlite` deploys for simple bees.
4. **BYOP billing** — require App Key / user-pays only after the worker path is
   stable.
5. **Container runtime** — add Daytona or AgentCore after one worker bee works
   end-to-end.
6. **More surfaces** — add web, A2A, Discord only after OpenAI-compatible
   invocation is boring.

## YAGNI guardrails

- Do not make developers choose a provider on day one.
- Do not add a marketplace before deploy + invoke works.
- Do not add GitHub memory as runtime state; keep it archive/export only.
- Do not ship multiple framework variants in production docs.
- Do not add new billing scopes until one real deploy path needs them.
- Do not expose container deploys before spend limits and teardown exist.

## Questions to answer before building more

1. Is v1 only OpenAI-compatible chat, with every bee callable through regular
   `/v1/chat/completions` model routing?
2. Should `polli bees deploy` create a model alias automatically, or should
   aliases be explicit in `bee.json`?
3. Is the first production bee author-pays only, to avoid BYOP complexity?
4. What is the minimum state we need for v1: SQLite conversation history only?
5. Are Discord and A2A deferred until after the OpenAI surface is live?
6. What is the first hosted runtime: Cloudflare Worker/Agents only?
7. What spend cap is required before any user-pays bee can run?
8. Do developer keys need `bees:*` scopes in v1, or can deploy be admin-only
   while the API shape settles?
9. Should container bees stay reference-only until provider teardown,
   cancellation, and logs are solved?
10. What is the one app that proves the pattern without adding product scope?
