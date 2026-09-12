# Computer MCP

A private, persistent computer for every Pollinations account: a filesystem
plus a bash shell, exposed as a Streamable HTTP MCP server. Nothing runs while
idle.

Built on [`@cloudflare/computer`](https://github.com/cloudflare/computer)
(preview). Each user gets one Durable Object whose SQLite holds the
filesystem, plus one shared Durable Object for `/public`. The single `bash` tool runs [just-bash](https://github.com/vercel-labs/just-bash)
in a throwaway Dynamic Worker that talks back to the Durable Object for file
access. No container, no Linux. The shell has coreutils, grep, sed, awk, jq,
tar, curl and git; no Node or Python. `curl` uses the Dynamic Worker's own
`fetch`, so the shell can reach any public URL (egress `direct`); there is no
host allowlist.

## The tool

One tool, `bash`, with `command`, optional `stdin` (file content for
`cat > path`, passed as-is, no quoting) and optional `cwd`, created if
missing. The `cwd` picks the computer: anything under `/workspace` (the
default) runs on the caller's private Durable Object, anything under `/public`
runs on one Durable Object shared by every Pollinations user. A command only
sees the computer its cwd is on, so the two cannot leak into each other and no
chroot is needed. Projects are folders (`/workspace/thesis`), listable with
`ls`. The shared computer has no access control and no attribution: last
writer wins, same as two chats of one user today; its README asks agents to
append rather than rewrite and to commit with git if history matters. Inside
the shell, `assets publish <path>` copies a
file to the Pollinations media service (`MEDIA` service binding, the same
one ffmpeg-mcp uses) and prints its public `https://media.pollinations.ai/…`
URL. It is a snapshot with media's 30-day retention, refreshed on reads; the
command's expiry argument is ignored. `curl -o <path> <url>` is the way back
in, for media URLs or anything else public. Every successful call is billed at one flat rate (`computer.tool_call.v1`, reported to gen as a
usage receipt); discovery requests and storage are free. Memory is a convention,
not a tool: a `/workspace/README.md` seeded on first use tells the agent to keep
current facts in `memory/facts.md` and a dated append-only journal in
`memory/log/`.

## How requests reach it

The Worker is private (`workers_dev: false`, no routes). Gen's
`/mcp/computer` route authenticates the caller, then calls this Worker through
the `COMPUTER_MCP` service binding with the `x-pollinations-user-id` header
set. That header selects the private Durable Object (`user:<userId>`); a `cwd`
under `/public` selects `shared:public` instead. A missing header is a 401.
The registry entry lives in `shared/registry/mcp.ts`.

## Local

```bash
npm install
npm test          # workers pool, includes a real bash exec
npm run typecheck
npm run dev       # http://localhost:8787
```

Call it directly with the user header (the gen proxy sets it in production):

```bash
curl -s http://localhost:8787/ \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'x-pollinations-user-id: local-test' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"bash","arguments":{"command":"ls /workspace"}}}'
```

## Deploy

Staging: `npm run deploy:staging` (Worker `pollinations-computer-mcp-staging`).
Production deploys only through the `Deploy / Cloudflare production` workflow,
which handles `apps/*-mcp` before gen so the binding target exists. Requires a
paid Workers plan for `worker_loaders`.
