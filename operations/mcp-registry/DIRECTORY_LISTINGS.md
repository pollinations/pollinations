# Directory listings that need a human

The official MCP registry is published by
[`.github/workflows/mcp-registry.yml`](../../.github/workflows/mcp-registry.yml)
with GitHub OIDC, so the `io.github.pollinations/*` entries need nobody at a
keyboard. The directories below either want an account that owns the
Pollinations namespace or a claim step, so they are a few minutes of manual
work for a maintainer.

Listing copy, reused below:

```text
Name:          Pollinations
Title:         Pollinations MCP
Description:   Access Pollinations models and API capabilities through agent tools.
Endpoint:      https://gen.pollinations.ai/mcp/pollinations
Transport:     streamable-http
Authentication: API key sent as `Authorization: Bearer <key>`.
                Create one at https://enter.pollinations.ai/keys.
Homepage:      https://pollinations.ai
Setup docs:    https://gen.pollinations.ai/docs#tag/mcp-servers
Source:        https://github.com/pollinations/pollinations (MIT)
Categories:    ai, image-generation, text-generation, audio, video, agent-tools
```

The gateway serves one endpoint per server id, and the workflow publishes an
entry for each of them: `pollinations`, `ask-jev`, `ffmpeg`, `exa`, `composio`
and `computer`. Listing only the aggregator endpoint is enough if a directory
makes you hand-write each server.

## Smithery

Who: the Pollinations GitHub account, or an owner of the organisation that will
hold the `pollinations` namespace.

```bash
npx @smithery/cli auth login

npx @smithery/cli mcp publish "https://gen.pollinations.ai/mcp/pollinations" \
    -n pollinations/pollinations \
    --config-schema '{"type":"object","properties":{"apiKey":{"type":"string","description":"Pollinations API key from https://enter.pollinations.ai/keys"}},"required":["apiKey"]}'
```

Repeat with the matching URL and `-n pollinations/<id>` for the other five
servers. Smithery scans the endpoint for tools, so nothing else is needed; the
API key is the only session configuration, which is what `--config-schema`
declares. If the namespace does not exist yet in Smithery, create it from the
account settings first, or publish under the maintainer's namespace and move the
listing afterwards.

## Glama

Who: an owner of the `pollinations` GitHub organisation, or anyone who can serve
a file on the gateway domain.

1. Open the connectors page, choose **Add MCP Server → Connector**.
2. Fill in the name, the description above, the URL
   `https://gen.pollinations.ai/mcp/pollinations` and the streamable-http
   transport. The endpoint refuses unauthenticated calls, so paste a Pollinations
   key as the private test credential if you want the health check to pass.
3. Claim ownership. **Claim with GitHub** works directly when the signed-in
   account owns the organisation behind the namespace; the alternative
   `/.well-known/glama.json` challenge would need a change on the gateway that
   this pull request deliberately does not make.
4. Glama read the official registry before this listing existed, so the name,
   description and URL of an entry linked to `io.github.pollinations/*` keep
   following the registry by default. Publish to the registry first, then claim,
   and the two stay in sync.

## mcp.so

Who: any maintainer account; this one is a correction rather than a new listing.

The npm package the directory points at, `@pollinations/mcp`, is deprecated with
`Retired. Use the hosted MCP server: https://gen.pollinations.ai/mcp/pollinations
(setup: https://gen.pollinations.ai/docs#tag/mcp-servers)`, so the install
instructions people copy from the directory no longer work.

1. Search `pollinations` on mcp.so and open the existing entry.
2. Submit the corrected entry at <https://mcp.so/submit> (sign in with GitHub)
   using the copy above, with the connection as a remote MCP server on
   `https://gen.pollinations.ai/mcp/pollinations` and the `Authorization: Bearer
   <key>` header.
3. If the existing entry cannot be edited from the site, their FAQ says
   submissions can also go through an issue in their GitHub repository; ask them
   to retire the npm-based entry and keep the hosted one.

## Everything else

Subregistries and aggregators that read the official registry API, Glama's
connector sync among them, pick the entries up once the workflow has published
them. Nothing else has to be written by hand for those, but a listing that wants
ownership proof still needs the claim step above.
