# Probe of codex's deployed Cloudflare worker

URL: `https://minimal-cloudflare-agents-bee-staging-codex.thomash-efd.workers.dev`
Source: codex's PR #10636, deployed via `npx wrangler deploy` per their issue comment.

This file has two sections — the original probe (Phase H, 2026-05-03 ~10:38Z) and a re-probe after codex addressed the bugs (Phase I, 2026-05-03 ~11:05Z).

## Phase I re-probe (current)

| Method | Path                              | Status | Notes |
|--------|-----------------------------------|--------|-------|
| GET    | `/.well-known/agent-card.json`    | 200    | A2A v0.3.0 card, unchanged |
| POST   | `/message`                        | 200    | `{text, state: {turns}}` (unchanged) |
| POST   | `/web/messages`                   | **200**| **fixed** — same shape as `/message` (alias) |
| POST   | `/a2a`                            | **200**| **fixed** — proper JSON-RPC 2.0 envelope, A2A v0.3.0 message shape |
| POST   | `/v1/chat/completions`            | 404    | not a bug — bee.json declares only `["web", "a2a"]` |
| GET    | `/`                               | 404    | no root index — not a bug |

The two divergences flagged in Phase H ((1) card-promised /a2a 404, (2) `/web/messages` not served) are both fixed. State persistence still works (turn counter 14 → 17 across our calls).

### A2A response shape (newly served)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "message": {
      "role": "agent",
      "parts": [{ "kind": "text", "text": "Cloudflare bee turn 15: ..." }]
    },
    "metadata": { "state": { "turns": 15 } }
  }
}
```

This matches the A2A v0.3.0 spec — `result.message.role: "agent"`, `parts[].kind: "text"`. Captured in `a2a-response.json`.

### `/web/messages` response shape

```json
{ "text": "Cloudflare bee turn 16: ...", "state": { "turns": 16 } }
```

Same shape as `/message` — codex made `/web/messages` an alias rather than changing the existing path. Captured in `web-messages-response.json`.

## Phase H probe (historical, 2026-05-03 ~10:38Z)

The fixtures captured then are documented in commit `fc91a46ea`. At that time:

| Path                              | Phase H | Phase I |
|-----------------------------------|---------|---------|
| `POST /a2a`                       | 404     | 200     |
| `POST /web/messages`              | 404     | 200     |
| `POST /message`                   | 200     | 200     |
| `GET /.well-known/agent-card.json`| 200     | 200     |

The Phase H findings were posted on issue #10628 and codex addressed both before the next fire. Concrete external-observer evidence drove a real fix.

## Remaining gaps (Phase I)

- Our A2A handler returns plain JSON, not JSON-RPC 2.0 envelopes. Codex's `/a2a` returns proper JSON-RPC 2.0 (`{jsonrpc, id, result: {message, metadata}}`). Worth adopting at the handler.ts level for spec parity if we want to interoperate with A2A clients.

(Resolved this iteration: `protocolVersion` bumped from 0.2.5 → 0.3.0 in `bees/catgpt/surfaces/a2a/handler.ts`.)

## Refresh procedure

```bash
curl -fsS "https://minimal-cloudflare-agents-bee-staging-codex.thomash-efd.workers.dev/.well-known/agent-card.json" \
  -o bees/deploy-api/test-fixtures/codex-deployed-cf/agent-card.json

curl -fsS -X POST "https://minimal-cloudflare-agents-bee-staging-codex.thomash-efd.workers.dev/a2a" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"role":"user","parts":[{"kind":"text","text":"reprobe"}]}}}' \
  -o bees/deploy-api/test-fixtures/codex-deployed-cf/a2a-response.json
```
