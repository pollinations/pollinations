# Computer MCP

A private, persistent computer for every Pollinations account: a filesystem
plus a Linux shell, exposed as a Streamable HTTP MCP server.

Built on [`@cloudflare/computer`](https://github.com/cloudflare/computer)
(preview). Managed agents get one Durable Object for each caller, agent and
workspace; direct MCP use gets one for each caller and workspace. Its SQLite
holds the filesystem. The `bash` tool lazily starts a Debian Cloudflare
Container with Node.js, npm, apt, git, jq, native binaries and outbound network.
Every command uses that container. It stops after five minutes without commands;
the next command starts it again. Background processes do not survive. Only
`/workspace` survives a container restart, so project dependencies belong there;
system packages installed outside it are temporary.

## Tools

`bash` accepts `command`, optional `stdin` (file content for
`cat > path`, passed as-is, no quoting), and optional `workspace`
(`default` when omitted). Each stable
lowercase workspace name selects a separate filesystem. Commands begin in
`/workspace`; use `cd` inside a command when needed. Nothing is shared between
users. Files come in with `curl -o`
(any public URL) or `git clone` (any public repository) and go out with
`publish_file` with an absolute `path` and the same optional `workspace`. It copies
one file to the Pollinations media service (`MEDIA` service binding, the same
one ffmpeg-mcp uses) and prints its unlisted `https://media.pollinations.ai/…`
URL (a snapshot with media's 30-day retention, refreshed on reads).
Commands can also use
`git push` to a repository the user owns, using a token they provide in the
remote URL. The service mints no credentials of its own. Every successful call
is billed at one flat rate (`computer.tool_call.v1`, reported to gen as a usage
receipt); discovery requests and storage are free. Memory is a convention, not
a tool: a `/workspace/README.md` seeded on first use tells the agent to keep
current facts in `memory/facts.md` and a dated append-only journal in
`memory/log/`.

## Ports and SSH

A computer is also a runtime the owner connects to. Only the owner reaches it:
Gen picks the Durable Object from the authenticated caller, exactly as for MCP.

- `/workspaces/<name>/ports/<port>/<path>` proxies HTTP to a server in the
  container (`fetchPort`), for ports 1024–65535 except computerd's 8080 and
  sshd's 2222. When nothing listens, the Durable Object runs
  `/workspace/start.sh` in the background (log in `/workspace/.start.log`)
  and retries for 20 seconds. Each request pushes back the idle shutdown and is
  billed `computer.port_request.v1`.
- `/workspaces/<name>/ssh` upgrades to a WebSocket piped to sshd on port 2222
  (key auth only, keys in `/workspace/.ssh/authorized_keys`). An open session
  keeps the container running for up to an hour and is billed once
  (`computer.ssh_session.v1`). `wrangler containers ssh` is not used because
  it authenticates against the Cloudflare account.

## How requests reach it

The Worker is private (`workers_dev: false`, no routes). Gen's
`/mcp/computer` route authenticates the caller, then calls this Worker through
the `COMPUTER_MCP` service binding with the `x-pollinations-user-id` header
set. For delegated agent runs, Gen also derives an agent header from the signed
`ag_` credential. Those headers and the tool's workspace name select the
Durable Object. Its name is `user:<userId>:agent:<agentId>:workspace:<name>`
for an agent, or `user:<userId>:workspace:<name>` for direct MCP use. Caller
supplied identity headers are discarded by Gen. A missing user header is a 401
here.
The registry entry lives in `shared/registry/mcp.ts`.

## Local

```bash
npm install
npm test          # Workers pool: routing, discovery, isolation and publishing
npm run typecheck
npm run dev -- --port 8790
npm run test:container # in another terminal, exercises real Linux commands
```

`npm run dev` requires Docker because Wrangler builds the configured container
image. The Workers pool tests run without Docker. `test:container` exercises
Node, npm installs, stdin, errors, workspace isolation, file publishing,
`start.sh` behind a port and the SSH banner over WebSocket against a running Worker (override its URL with `COMPUTER_MCP_URL`).
Add `-- --idle` to also wait five minutes and verify container restart with
files and installed packages restored and `start.sh` rerun. `COMPUTER_TEST_USER` reuses a test caller.

Call it directly with the user header (the gen proxy sets it in production):

```bash
curl -s http://localhost:8790/ \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'x-pollinations-user-id: local-test' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"bash","arguments":{"command":"ls /workspace"}}}'
```

All commands, including `node --version`, run in Debian.

## Deploy

Staging: `npm run deploy:staging` (Worker `pollinations-computer-mcp-staging`).
Production deploys only through the `Deploy / Cloudflare production` workflow,
which handles `apps/*-mcp` before gen so the binding target exists. Requires a
paid Workers plan with Containers.
