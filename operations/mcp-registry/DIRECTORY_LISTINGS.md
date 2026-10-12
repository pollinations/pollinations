# Hosted MCP listings

Generate listings from `shared/registry/mcp.ts`; do not maintain separate copies
of the server catalog. Each endpoint uses Streamable HTTP and requires
`Authorization: Bearer <key>`. Users get their own key at
https://enter.pollinations.ai/keys. Setup docs: https://gen.pollinations.ai/docs#tag/mcp-servers.

## Official registry

Run **MCP / Publish registry entries** from `main` with a new version, e.g.
`1.0.0`. The workflow tests and validates all entries before logging in with
GitHub OIDC; no stored publishing secret is needed. Published versions are
immutable: use a new version for changes, including after a partially successful
batch. Check the workflow output and registry before retrying.

Local preview (Node 24, no dependencies or login):

```sh
node --test operations/mcp-registry/generate-server-json.test.ts
node operations/mcp-registry/generate-server-json.ts /tmp/mcp-registry 1.0.0
```

Publishing here does not submit to the directories below. Use the Pollinations
organization's account and record the resulting listing URLs in issue #15529.

For the main listing, use title **Pollinations**, description **Access
Pollinations models and API capabilities through agent tools**, and URL
`https://gen.pollinations.ai/mcp/pollinations`, with the auth and setup links above.

## Smithery

Use [URL publishing](https://smithery.ai/docs/build/publish) for each hosted
endpoint. Our servers use API keys, not OAuth. Configure a required secret string
field whose value is the complete `Bearer <key>` header, mapped to the upstream
`Authorization` header using
[session configuration](https://smithery.ai/docs/build/session-config):

```json
{
  "type": "object",
  "properties": {
    "pollinationsAuthorization": {
      "type": "string",
      "description": "Bearer followed by a space and your Pollinations API key",
      "x-from": { "header": "pollinations-api-key" },
      "x-to": { "header": "Authorization" }
    }
  },
  "required": ["pollinationsAuthorization"]
}
```

Do not put an actual key in public metadata or commands. A bare `apiKey` field
without header mapping is not sufficient. Verify authenticated tool discovery
and a tool call before marking a listing complete; this configuration alone is
not proof of a working listing.

## Glama and mcp.so

- [Glama](https://glama.ai/mcp/servers): submit the hosted URLs and claim the
  Pollinations organization/domain using its [ownership instructions](https://glama.ai/mcp/faq).
  GitHub organization verification requires the Glama app; domain verification
  offers DNS or a well-known file. Obtain approval before granting app access or
  changing DNS.
- [mcp.so](https://mcp.so/submit): request correction of the existing Pollinations
  listing from the retired `npx @pollinations/mcp` command to the hosted endpoint
  and bearer-key setup. Do not claim or alter unrelated community wrappers.

These submissions and ownership checks require maintainer action; the workflow
does not automate them.
