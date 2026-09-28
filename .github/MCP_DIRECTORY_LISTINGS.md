# MCP directory listings (maintainer runbook)

The official MCP registry is published automatically by
`.github/workflows/mcp-publish-registry.yml` (GitHub OIDC — no secrets).
The three directories below need a one-time manual submission by someone
with a `pollinations` org account. Shared facts:

- Hosted server list (source of truth): `GET https://gen.pollinations.ai/mcp`,
  built from `shared/registry/mcp.ts`
- Transport: Streamable HTTP
- Auth: `Authorization: Bearer <API key>` — keys at https://enter.pollinations.ai/keys
- Setup docs: https://gen.pollinations.ai/docs#tag/mcp-servers
- Per-server endpoints: `https://gen.pollinations.ai/mcp/<server-id>` with
  server ids: `pollinations`, `ask-jev`, `ffmpeg`, `exa`, `composio`, `computer`

Names and descriptions below are from the live `/mcp` list — copy them from
there again at submit time if they changed.

## Smithery (https://smithery.ai)

Smithery has no Pollinations entry today. Create one per hosted server:

1. Sign in at https://smithery.ai with a `pollinations` org GitHub account.
2. Go to https://smithery.ai/new?type=server and choose the hosted/remote
   server option.
3. Submit for each server id:

```
Name: Pollinations — <server name from GET /mcp>
URL: https://gen.pollinations.ai/mcp/<server-id>
Transport: streamable-http
Authentication: API key required — Authorization: Bearer <key>
  Keys: https://enter.pollinations.ai/keys
Description: <server description from GET /mcp>
```

Listing text for the main server, ready to paste:

```
Name: Pollinations — Pollinations
URL: https://gen.pollinations.ai/mcp/pollinations
Transport: streamable-http
Authentication: API key required — Authorization: Bearer <key> (https://enter.pollinations.ai/keys)
Description: Access Pollinations models and API capabilities through agent tools.
Setup: https://gen.pollinations.ai/docs#tag/mcp-servers
```

## Glama (https://glama.ai)

Glama only shows community ChuckNorris wrappers for this repo today.

1. Sign in at https://glama.ai with a `pollinations` org GitHub account.
2. Browse to https://glama.ai/mcp/servers, open the Pollinations group, and
   use its "Add MCP server" / claim flow to add the hosted endpoints.
3. For each server id, submit: name, URL `https://gen.pollinations.ai/mcp/<server-id>`,
   transport streamable-http, auth Bearer API key, description from `GET /mcp`,
   setup docs link as above.
4. If the claim flow offers it, retire/update the ChuckNorris entries that
   point at the old separate repository (out of scope otherwise).

## mcp.so (https://mcp.so)

The current entry at https://mcp.so/server/pollinations installs the retired
npm package `@pollinations/mcp` (`npx @pollinations/mcp`, stdio). That package
was retired on 23 Sep 2026 in favour of the hosted server. The page has a
"Claim" button for the owner; there is also a general form at
https://mcp.so/submit.

1. Sign in at https://mcp.so and use "Claim" on the Pollinations page (org
   account), or the https://mcp.so/submit form.
2. Ask for the Config/Install section to be replaced with:

```
Hosted server (Streamable HTTP): https://gen.pollinations.ai/mcp/pollinations
Auth: Authorization: Bearer <API key> — get a key at https://enter.pollinations.ai/keys
Client config:
{
  "mcpServers": {
    "pollinations": {
      "type": "http",
      "url": "https://gen.pollinations.ai/mcp/pollinations",
      "headers": { "Authorization": "Bearer YOUR_POLLINATIONS_API_KEY" }
    }
  }
}
Docs: https://gen.pollinations.ai/docs#tag/mcp-servers
Repository: https://github.com/pollinations/pollinations
```

3. Note in the request that the npm package `@pollinations/mcp` is retired
   and five more hosted servers are available (ask-jev, ffmpeg, exa,
   composio, computer) at `https://gen.pollinations.ai/mcp/<server-id>`.
