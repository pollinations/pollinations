# Minimal Cloudflare Agents bee

Smallest useful reference for a Pollinations bee on the Cloudflare Agents SDK.

Use this when the bee should be:

- stateful per user or channel;
- close to `gen.pollinations.ai`;
- deployable as a Worker/Durable Object;
- mostly TypeScript/HTTP without a Linux workspace.

## Shape

- `src/index.ts` exports a single `Agent` subclass.
- `GET /` and `GET /v1/chat/completions` return discovery JSON with a copyable curl.
- `POST /v1/chat/completions` accepts OpenAI-compatible chat requests.
- `POST /bees/bee_minimal-cloudflare-agents-bee/v1/chat/completions` is the hosted OpenAI projection.
- `POST /web/messages` accepts `{ "text": "...", "userId": "..." }`.
- `POST /a2a` accepts a minimal A2A JSON-RPC message request.
- `GET /.well-known/agent-card.json` exposes A2A discovery metadata.
- `POST /message` remains as a compatibility alias for the smoke test.
- SQLite state is represented by the SDK agent instance; production code
  would add domain tables through `this.sql`.

## Wrangler smoke

```bash
npm install --package-lock=false
npx wrangler dev --local --port 18789 --ip 127.0.0.1
curl http://127.0.0.1:18789/
curl -X POST http://127.0.0.1:18789/v1/chat/completions \
  -H 'content-type: application/json' \
  --data '{"model":"bee:minimal-cloudflare","messages":[{"role":"user","content":"hello"}]}'
curl http://127.0.0.1:18789/.well-known/agent-card.json
curl -X POST http://127.0.0.1:18789/web/messages \
  -H 'content-type: application/json' \
  --data '{"text":"hello"}'
curl -X POST http://127.0.0.1:18789/a2a \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":"1","method":"message/send","params":{"message":{"parts":[{"text":"hello"}]}}}'
```

Staging-style deploy without routes:

```bash
npx wrangler deploy --dry-run --name minimal-cloudflare-agents-bee-staging-codex
npx wrangler deploy --name minimal-cloudflare-agents-bee-staging-codex
```

## Why this is promising

This is the lowest-latency stateful option. It should be the first production
path for lightweight bees that do not need a shell, browser, or filesystem.
