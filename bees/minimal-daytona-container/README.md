# Minimal Daytona/container bee

Smallest useful reference for a bee that needs a Linux workspace.

Use this when the bee should be able to:

- run shell commands;
- keep files between calls;
- install packages dynamically;
- run coding agents or browser automation later.

## Shape

- Plain Node HTTP server.
- No framework dependency.
- Dockerfile works locally or inside a Daytona workspace.
- `daytona.json` records the intended sandbox shape.

## Routes

- `GET /health`
- `GET /.well-known/agent-card.json`
- `POST /message` with `{ "text": "..." }`

This is deliberately not Cloudflare-specific. It is the baseline for Daytona,
Runloop, generic containers, and similar workspace providers.
