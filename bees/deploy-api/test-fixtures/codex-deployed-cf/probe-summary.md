# Probe of codex's deployed Cloudflare worker

URL: `https://minimal-cloudflare-agents-bee-staging-codex.thomash-efd.workers.dev`
Source: codex's PR #10636, deployed via `npx wrangler deploy` per their issue comment.

This file has three sections — the original probe (Phase H, 2026-05-03 ~10:38Z), a re-probe after codex addressed the bugs (Phase I, 2026-05-03 ~11:05Z), and a probe of the new OpenAI-compat surface (Phase J, 2026-05-03 ~11:35Z) after codex shipped "all bees are OpenAI-compatible agents" + the friction-research simplifications.

## Phase J — OpenAI surface probe (current)

After codex shipped commit `eaf18f5f9` ("all bees are OpenAI-compatible agents") + `08708141d` (friction-research simplifications: surfaces=["openai"] default, author-pays default, placeholder rejection), the live worker now serves two new paths.

| Method | Path                                                              | Status | Notes |
|--------|-------------------------------------------------------------------|--------|-------|
| POST   | `/v1/chat/completions`                                            | **200**| **new** — canonical OpenAI Chat Completion shape with `metadata.state` extension |
| POST   | `/bees/bee_minimal-cloudflare-agents-bee/v1/chat/completions`     | **200**| **new** — hosted-projection alias of the above (path-rewrite) |

### Concrete observations on the OpenAI surface

| Probe                                       | Result | Notes |
|---------------------------------------------|--------|-------|
| Canonical happy path                        | 200    | Standard `chat.completion` shape; bee extras go on `metadata.state` (single namespaced key — matches B2 from friction research) |
| Empty body `{}`                             | 200    | No validation; model echoes back as the bee name when missing in input |
| Missing `messages` array                    | 200    | No validation; empty content reply |
| `stream: true`                              | 200    | Returns single non-streamed JSON response. Caller asking for SSE silently gets a regular JSON. |
| `Authorization: Bearer pk_totally_fake`     | 200    | Bogus bearer accepted; auth not enforced on this minimal bee |
| `/bees/SOME-OTHER-ID/v1/chat/completions`   | 200    | Hosted projection does not validate the bee id; any id reaches the same DO |
| `messages: [{role: "assistant", ...}]`      | 200    | User input with role: "assistant" silently produces empty content |
| `usage` field                               | absent | Minimal bee echoes; doesn't call any model; no token counts |
| `model` field in response                   | echo   | Bee echoes whatever model the request passed (e.g., `"x"`) |

The minimal bee is *aggressively* lenient — `{}` validates, bogus tokens validate, wrong bee ids validate. By design for a reference, but documents that production bees will need their own validation layer at the surface adapter.

### A2A v0.3.0 endpoint contract (reminder, unchanged from Phase I)

`POST /a2a` returns proper JSON-RPC 2.0 envelopes. The `metadata.state.turns` extension on the OpenAI surface uses the same shape as `result.metadata.state.turns` on the A2A surface — single key, namespaced under `metadata.state`. Cross-surface consistency is a quiet win.

## Phase I re-probe

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
