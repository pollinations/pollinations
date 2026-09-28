# MCP directory listings for the hosted Pollinations servers

The official registry is published automatically: the
`MCP / Publish hosted servers to the official registry` workflow regenerates
`servers/*.server.json` from the live hosted list and publishes them under
`io.github.pollinations/` with GitHub OIDC (no new secret). A maintainer just
runs it.

The directories below need a Pollinations-org account, so this file carries
everything a maintainer needs to submit each one in a few minutes: where to go,
what to click, and copy-paste listing text. Every listing states where to get an
API key and links the setup docs.

Common facts for every listing (do not change these in the text below):

- Hosted URL: `https://gen.pollinations.ai/mcp/<server-id>` (Streamable HTTP)
- Authentication: `Authorization: Bearer <API key>` header on every request
- API keys: https://enter.pollinations.ai/keys
- Setup docs: https://gen.pollinations.ai/docs#tag/mcp-servers
- Usage is billed to the caller's own Pollen balance

## Smithery

Smithery lists hosted servers by proxying them through its gateway and scanning
their tools, so the listing must be created from the Pollinations org.

Steps (as the org's Smithery account):

1. Sign in at https://smithery.ai with the Pollinations account.
2. Open https://smithery.ai/new and add a server by its HTTPS URL. Repeat for
   each hosted server you want listed (at minimum the main Pollinations
   server): `https://gen.pollinations.ai/mcp/pollinations`
3. Complete the vendor verification checklist in settings so the org is marked
   verified.
4. Check each server card: the gateway will call the tools endpoint; since
   tools require the Authorization header, confirm Smithery's config UI asks
   for the API key (see the listing text below).

Listing text to paste into each server's description field:

> Pollinations (hosted). Generate text, images, and speech with Pollinations
> models through MCP tools. Remote server: https://gen.pollinations.ai/mcp/pollinations
> (Streamable HTTP). Requires a Pollinations API key sent as
> `Authorization: Bearer <key>`; get one at https://enter.pollinations.ai/keys.
> Usage is billed to your own Pollen balance. Setup docs:
> https://gen.pollinations.ai/docs#tag/mcp-servers

## Glama

Glama lists remote servers as Connectors, added through its Add Server form,
and verifies ownership with a claim token served from the server's domain.

Steps (as the org's Glama account):

1. Sign in at https://glama.ai and open the Add Server form
   (https://glama.ai/mcp/servers/new).
2. Submit the hosted URL: `https://gen.pollinations.ai/mcp/pollinations` as a
   remote/connector server. Repeat per hosted server you want listed.
3. Ownership: Glama asks for a `/.well-known/glama.json` claim token on the
   host domain. Since gen.pollinations.ai is the org's own service, add the
   token file there (one-line change to the gen routing, serving the token
   Glama shows). Alternatively use the "verify via GitHub" option with the
   pollinations/pollinations repository, if offered for the URL type.
4. Note: Glama's periodic health probe sends no API key, so a key-required
   server can display as "Unhealthy" even while working correctly. Mention the
   required header in the listing text so users are not put off.

Listing text:

> Pollinations (hosted remote MCP). Generate text, images, and speech with
> Pollinations models. Endpoint: https://gen.pollinations.ai/mcp/pollinations
> (Streamable HTTP). Requires `Authorization: Bearer <API key>`; keys at
> https://enter.pollinations.ai/keys. The public health probe does not send a
> key, so an "Unhealthy" badge does not mean the server is down. Setup docs:
> https://gen.pollinations.ai/docs#tag/mcp-servers

## mcp.so

mcp.so's existing "Pollinations" entry installs `@pollinations/mcp`, the npm
package retired on 23 Sep in favour of the hosted server. The fix is to replace
the entry's install target with the hosted server. mcp.so's form takes a
repository URL and name, and offers a Remote Server type; paid fast-lane
options are not needed.

Steps (as the org's mcp.so account):

1. Sign in at https://mcp.so and open the submit form.
2. Choose the Remote Server type. Repository URL:
   https://github.com/pollinations/pollinations, name `Pollinations`.
3. Remote URL: `https://gen.pollinations.ai/mcp/pollinations`.
4. If the existing npm-based entry can be claimed instead of a new one, claim it
   and update its install target to the remote URL above; a comment to the
   mcp.so maintainers referencing the retirement of `@pollinations/mcp` should
   be enough if claiming is not self-service.

Listing text:

> Pollinations (hosted remote MCP; replaces the retired @pollinations/mcp npm
> package). Generate text, images, and speech with Pollinations models.
> Endpoint: https://gen.pollinations.ai/mcp/pollinations (Streamable HTTP).
> Requires `Authorization: Bearer <API key>`; get one at
> https://enter.pollinations.ai/keys. Usage is billed to your own Pollen.
> Setup docs: https://gen.pollinations.ai/docs#tag/mcp-servers

## Out of scope (per quest #15529)

- Community wrappers listed by other people.
- The ChuckNorris server (separate repository, not a hosted server).
- OAuth sign-in for MCP clients; the servers accept API keys today.
