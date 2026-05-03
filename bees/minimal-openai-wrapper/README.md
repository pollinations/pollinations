# Minimal OpenAI wrapper bee

Smallest bee that behaves like an OpenAI-compatible chat-completions endpoint.

It does one thing:

1. accepts `POST /v1/chat/completions`;
2. replaces caller-provided system messages with one hard-coded bee prompt;
3. forwards the request to a base Pollinations text model;
4. returns the upstream OpenAI-compatible response.

This is the "agent as a model" reference. It is useful when an app only needs a
thin personality/tool policy wrapper over an existing Pollinations model.

## Run locally

```bash
export POLLINATIONS_API_KEY=sk_...
npm start
```

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "content-type: application/json" \
  -H "authorization: Bearer $POLLINATIONS_API_KEY" \
  -d '{"model":"minimal-openai-wrapper","messages":[{"role":"user","content":"hello"}]}'
```

## Deploy shape

`bee.json` declares only the `openai` surface. A hosted deployment should project:

```text
/bees/bee_minimal-openai-wrapper-bee/v1/chat/completions
```

The worker also accepts `/v1/chat/completions` directly for standalone deploys.

