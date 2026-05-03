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

## Why this is promising

This is the lowest-latency stateful option. It should be the first production
path for lightweight bees that do not need a shell, browser, or filesystem.
