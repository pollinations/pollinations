# Minimal Cloudflare Agents bee

Smallest useful reference for a Pollinations bee on the Cloudflare Agents SDK.

Use this when the bee should be:

- stateful per user or channel;
- close to `gen.pollinations.ai`;
- deployable as a Worker/Durable Object;
- mostly TypeScript/HTTP without a Linux workspace.

## Shape

- `src/index.ts` exports a single `Agent` subclass.
- `POST /message` accepts `{ "text": "...", "userId": "..." }`.
- `GET /.well-known/agent-card.json` exposes A2A discovery metadata.
- SQLite state is represented by the SDK agent instance; production code
  would add domain tables through `this.sql`.

## Wrangler smoke

```bash
npm install --package-lock=false
npx wrangler dev --local --port 18789 --ip 127.0.0.1
curl http://127.0.0.1:18789/.well-known/agent-card.json
curl -X POST http://127.0.0.1:18789/message \
  -H 'content-type: application/json' \
  --data '{"text":"hello"}'
```

Staging-style deploy without routes:

```bash
npx wrangler deploy --dry-run --name minimal-cloudflare-agents-bee-staging-codex
npx wrangler deploy --name minimal-cloudflare-agents-bee-staging-codex
```

## Why this is promising

This is the lowest-latency stateful option. It should be the first production
path for lightweight bees that do not need a shell, browser, or filesystem.
