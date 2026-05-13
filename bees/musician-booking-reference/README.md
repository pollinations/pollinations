# Musician Booking Reference Agent

Experimental reference agent for booking a musician for events. It is sanitized demo code with fake data and no external calendar, payment, messaging, or private-project dependencies.

The first implementation is intentionally small:

- transport-agnostic `handleInboundMessage(...)` entrypoint;
- SQLite-first schema in `src/schema.sql`;
- in-memory store that follows the schema shape for tests and demos;
- deterministic tools for packages, quotes, holds, bookings, conversation history, and audit events;
- OpenAI-compatible, A2A, Discord, web/SSE, and Worker-style HTTP adapters;
- CLI demo and `node:test` coverage.

Run locally:

```bash
npm install --prefix bees/musician-booking-reference
npm run demo --prefix bees/musician-booking-reference -- "I need a jazz trio for a 120 person gala in Berlin on 2026-07-18"
npm run test --prefix bees/musician-booking-reference
npm run serve --prefix bees/musician-booking-reference
```

This bee is not listed in `apps/APPS.md`; it is a reference implementation for the Pollinations agent platform design.

Reference routes exposed by `src/runtime/http.ts`:

- `GET /.well-known/agent-card.json`
- `POST /a2a`
- `POST /v1/chat/completions`
- `POST /web/messages`
- `POST /discord/messages`

Runtime entrypoints:

- `src/runtime/worker.ts` for Worker-style deployments.
- `src/runtime/node-server.ts` for container/workspace deployments.
- `src/providers/cloudflare/worker.ts` for Cloudflare Worker + Durable Object SQLite.
- `src/providers/aws/agentcore-server.ts` for AgentCore's `/invocations` + `/ping` contract.
- `src/providers/daytona/launcher.ts` for Daytona sandbox provisioning.

`handleBeeRequest(...)` accepts an optional `authorize` hook so Enter/BYOP can gate user-pays runs before the first message without changing the bee core.

See `deploy-api.md` for a first-pass API contract for user-deployed bees.
