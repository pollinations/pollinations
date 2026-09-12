# Computer MCP (Code Mode)

A private, persistent computer for every Pollinations account, exposed as a
Streamable HTTP MCP server. This is the upstream
[`cloudflare/computer` MCP example](https://github.com/cloudflare/computer/tree/main/examples/mcp)
(preview) with one change: requests are routed to a Durable Object per
Pollinations user instead of one shared workspace behind a bearer token.

`src/server.ts` and `Dockerfile` are verbatim upstream. `src/index.ts`
differs from upstream only in the Worker entry: it reads
`x-pollinations-user-id`, rejects requests without it, and serves the MCP
endpoint at `/` (gen rewrites `/mcp/computer` to `/`).

## What the client sees

One tool, `code`. The model writes JavaScript that calls `codemode.read`,
`codemode.write`, `codemode.edit`, `codemode.ls`, `codemode.find`,
`codemode.grep`, `codemode.delete`, and `codemode.exec`; the script runs in a
Dynamic Worker with no outbound network. Files under `/workspace` persist
between requests and agent runs.

Two shell backends: `worker-shell` (just-bash in a Dynamic Worker, default,
no network, no Node or Python) and `container-shell` (Debian with Node.js,
git, and outbound network in a Cloudflare Container, one container per active
user, cold start on first use).

## How requests reach it

The Worker is private (`workers_dev: false`, no routes). Gen's
`/mcp/computer` route authenticates the caller, then calls this Worker through
the `COMPUTER_MCP` service binding with the `x-pollinations-user-id` header
set. The registry entry lives in `shared/registry/mcp.ts`.

## Local

```bash
npm install
npm test          # workers pool, runs real code through the loader
npm run typecheck
npm run dev       # http://localhost:8787 (container backend needs Docker)
```

Call it directly with the user header (the gen proxy sets it in production):

```bash
curl -s http://localhost:8787/ \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'x-pollinations-user-id: local-test' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"code","arguments":{"code":"async () => (await codemode.exec({ command: \"ls /workspace\" })).stdout"}}}'
```

## Deploy

Staging: `npm run deploy:staging` (Worker `pollinations-computer-mcp-staging`;
needs Docker to build the container image). Production deploys only through
the `Deploy / Cloudflare production` workflow, which builds the image and
deploys `apps/*-mcp` before gen. Requires a paid Workers plan for
`worker_loaders` and Containers.
