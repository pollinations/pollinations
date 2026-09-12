# Computer MCP

A private, persistent computer for every Pollinations account: a filesystem
plus a bash shell, exposed as a Streamable HTTP MCP server. Nothing runs while
idle.

Built on [`@cloudflare/computer`](https://github.com/cloudflare/computer)
(preview). Each user gets one Durable Object whose SQLite holds the
whole filesystem. The single `bash` tool runs [just-bash](https://github.com/vercel-labs/just-bash)
in a throwaway Dynamic Worker that talks back to the Durable Object for file
access. No container, no Linux. The shell has coreutils, grep, sed, awk, jq,
tar, curl and git; no Node or Python. `curl` uses the Dynamic Worker's own
`fetch`, so the shell can reach any public URL (egress `direct`); there is no
host allowlist.

## The tool

One tool, `bash`, with `command`, optional `stdin` (file content for
`cat > path`, passed as-is, no quoting) and optional `cwd`, created if
missing and defaulting to `/workspace`. The whole tree persists except
`/tmp`, which is emptied after every call (stdin is fed to the command
from a file there); `/workspace` is only the home folder, and projects are
folders in it. Nothing is shared between users. Files come in with `curl -o` (any public URL) or `git clone`
(any public repository) and go out with `assets publish <path>`, which copies
one file to the Pollinations media service (`MEDIA` service binding, the same
one ffmpeg-mcp uses) and prints its unlisted `https://media.pollinations.ai/…`
URL (a snapshot with media's 30-day retention, refreshed on reads; the
command's expiry argument is ignored), or with `git push` to a repository the
user owns, using a token they provide in the remote URL. The service mints no
credentials of its own. Every successful call is billed at one flat rate (`computer.tool_call.v1`, reported to gen as a
usage receipt); discovery requests and storage are free. Memory is a convention,
not a tool: a `/workspace/README.md` seeded on first use tells the agent to keep
current facts in `memory/facts.md` and a dated append-only journal in
`memory/log/`.

## How requests reach it

The Worker is private (`workers_dev: false`, no routes). Gen's
`/mcp/computer` route authenticates the caller, then calls this Worker through
the `COMPUTER_MCP` service binding with the `x-pollinations-user-id` header
set. That header selects the Durable Object (`user:<userId>`), so a missing header
is a 401 here.
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
