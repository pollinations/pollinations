# surfaces/a2a

Google [A2A](https://google-a2a.github.io/A2A/specification/) (Agent2Agent) surface for CatGPT. Per the #10628 decisions, A2A is the v1 inter-agent protocol; MCP is dropped.

## Endpoints

- `GET /.well-known/agent-card.json` — discovery metadata for this bee. Capabilities, skills, endpoint URL.
- `POST /a2a` — JSON-RPC 2.0. Currently implements `message/send` (synchronous: send a `Message`, get a completed `Task` back).

## Example

```bash
curl http://localhost:8787/.well-known/agent-card.json | jq

curl -X POST http://localhost:8787/a2a \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":1,"method":"message/send",
    "params":{"message":{"role":"user","parts":[{"kind":"text","text":"why are boxes magic?"}]}}
  }' | jq
```

The response is a `Task` whose final history entry is the agent's reply — a text part with the cat's response and a data part with the comic URL.

## Files

- `handler.ts` — `handleA2ARequest(req)` routes both endpoints. Mountable into any HTTP host (Worker, Node, Bun, hono).
- `handler.test.ts` — 7 shape tests with a fetch stub. Validates JSON-RPC framing, agent card shape, message/send happy path, error paths, and file-part input.

## What's standard

- JSON-RPC 2.0 framing with `jsonrpc`/`id`/`method`/`params` and matching responses.
- A2A `Message` parts (`text`, `data`, `file`).
- A2A `Task` shape with `status.state: "completed"` and a history of messages.
- Agent card with `protocolVersion`, `capabilities`, `skills`, `defaultInputModes`/`defaultOutputModes`.

## What's not implemented (yet)

- `message/stream` — would require server-sent events.
- `tasks/get`, `tasks/cancel` — only relevant for long-running tasks; CatGPT is synchronous.
- Push notifications — not needed for a sync bee.
- Auth schemes beyond bearer token.

## Why it lives in surfaces/

Same as `openai-compat`: the implementation is *the same code regardless of the variant underneath*. Strong signal that surface adapters are platform concerns, not per-bee.
