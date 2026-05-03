# Probe of codex's deployed Cloudflare worker

URL: `https://minimal-cloudflare-agents-bee-staging-codex.thomash-efd.workers.dev`
Date: 2026-05-03 (this branch's last fire)
Source: codex's PR #10636, deployed via `npx wrangler deploy` per their issue comment.

## Endpoints actually served

| Method | Path                              | Status | Notes |
|--------|-----------------------------------|--------|-------|
| GET    | `/.well-known/agent-card.json`    | 200    | A2A v0.3.0 card |
| POST   | `/message`                        | 200    | `{text, state: {turns}}` |

## Endpoints that 404

| Method | Path                              | Status | Notes |
|--------|-----------------------------------|--------|-------|
| GET    | `/`                               | 404    | no root index |
| GET    | `/docs`                           | 404    | not at the bee level |
| POST   | `/v1/chat/completions`            | 404    | (correct: bee.json declares only `["web", "a2a"]` surfaces) |
| POST   | `/web/messages`                   | 404    | despite codex's `routeForSurface` projecting this URL |
| POST   | `/a2a`                            | 404    | despite agent card itself pointing here as `url` |

## Key divergences worth flagging

1. **Agent card lies about its A2A endpoint.** The card's `"url": ".../a2a"` plus `"preferredTransport": "JSONRPC"` advertises a JSON-RPC A2A surface that doesn't exist on the worker. A2A clients reading the card will fail.

2. **`routeForSurface` projects `/web/messages` and `/a2a`; the worker serves `/message`.** The URL projection in `bees/customer-deploy-reference/src/api.js` does not match what the actual minimal-cloudflare-agents bee implements. Either the worker needs to add aliases, or the projection needs to change.

3. **State persistence works.** Turn counter advances across requests — Durable Object backing is real, not a mock.

## What that means for our cherry-pick recommendations

- The A2A 404 is a genuine bug in the deployed worker (or a missing handler). Surface adapters are clearly the gap.
- Our `bees/catgpt/surfaces/a2a/handler.ts` implements the JSON-RPC `message/send` shape codex's agent card promises. This is the cherry-pick item codex's PR most needs.
- Our `bees/code-bee/surfaces/openai-compat/handler.ts` similarly fills the openai-surface gap that's not yet wired up on their worker.
