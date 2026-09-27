# MCP directory listings (maintainer runbook)

The official MCP registry is published automatically by
`.github/workflows/publish-mcp-registry.yml` (GitHub OIDC, no secrets).
The three directories below need one-time manual submission; everything
is copy-paste ready. Shared facts:

- Hosted server list (source of truth): `GET https://gen.pollinations.ai/mcp`
  (built from `shared/registry/mcp.ts`)
- Transport: Streamable HTTP
- Auth: `Authorization: Bearer <API key>` — keys at
  https://enter.pollinations.ai/keys
- Setup docs: https://gen.pollinations.ai/docs#tag/mcp-servers

Per-server endpoints: `https://gen.pollinations.ai/mcp/<server-id>` with
server ids: `pollinations`, `ask-jev`, `ffmpeg`, `exa`, `composio`,
`computer`.

## Smithery (smithery.ai)

1. Sign in at https://smithery.ai with a pollinations.org GitHub account.
2. "Add Server" → "Hosted server".
3. For each server id, submit:

```
Name: Pollinations — <server name>
URL: https://gen.pollinations.ai/mcp/<server-id>
Transport: streamable-http
Authentication: Bearer API key (required), keys: https://enter.pollinations.ai/keys
Description: <server description from GET /mcp>
```

Server names/descriptions are exactly the `name`/`description` fields of
the server list endpoint, so copy them from there at submit time.

## Glama (glama.ai)

1. Sign in at https://glama.ai with a pollinations.org GitHub account.
2. "List your MCP server" → paste endpoint URL and claim ownership.
3. Mark each server as "hosted" and fill the same fields as above.
4. Also uncheck/transfer the retired `ChuckNorris` community entry if the
   claim flow offers it (out of scope for this PR otherwise).

## mcp.so

1. The current entry installs `@pollinations/mcp`, retired on 23 Sep 2026
   in favour of the hosted server.
2. Use the update/claim form at https://mcp.so (bottom of the Pollinations
   page) or email their contact, requesting the install target change to:

```
Hosted server URL: https://gen.pollinations.ai/mcp/pollinations
Install: connect to the URL with any MCP client (Streamable HTTP)
Auth: Authorization: Bearer <API key> (https://enter.pollinations.ai/keys)
Docs: https://gen.pollinations.ai/docs#tag/mcp-servers
```

## Official MCP registry (automated)

After merge, run the "Publish MCP servers to the MCP Registry" workflow
once. It generates `server.json` entries from the live `/mcp` list,
validates them against the registry schema, and publishes each under
`io.github.pollinations/<server-id>` via GitHub OIDC. Later servers added
to `shared/registry/mcp.ts` appear on the next run with no hand-written
entries.
