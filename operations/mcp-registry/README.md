# MCP registry entries

The MCP servers we host live at `gen.pollinations.ai/mcp/<id>` and are declared
once in [`shared/registry/mcp.ts`](../../shared/registry/mcp.ts). This folder
turns that declaration into
[official MCP registry](https://registry.modelcontextprotocol.io) entries, so a
server added to `MCP_SERVERS` reaches the registry on the next publish without
anyone writing another entry by hand.

| File | Purpose |
| --- | --- |
| `entries.mts` | Maps `MCP_SERVERS` to registry `server.json` documents |
| `emit.mts` | Writes one `server.json` per server |
| `entries.test.mts` | Checks the fields the registry schema constrains |
| `DIRECTORY_LISTINGS.md` | Listing copy and steps for directories that need a human |

## Generate and validate locally

```bash
node operations/mcp-registry/emit.mts --out /tmp/mcp-registry --version 1.0.0

for entry in /tmp/mcp-registry/*/; do
    (cd "$entry" && mcp-publisher validate)
done
```

`mcp-publisher` is the registry's own CLI; the install step is in
[`.github/workflows/mcp-registry.yml`](../../.github/workflows/mcp-registry.yml).
`validate` asks the registry API to check the document, so it needs network
access and is the same check the workflow runs on every pull request.

## Publishing

`.github/workflows/mcp-registry.yml` runs on pull requests that touch the
registry files: it tests the generator, generates the entries, and validates
every one of them against the registry schema. A maintainer then dispatches the
same workflow from `main` with a version to publish. The publish job
authenticates with GitHub OIDC (`id-token: write`) and stores no secret, because
the registry grants the `io.github.pollinations` namespace to workflows running
in this repository.

Two things to keep in mind:

- Publishing an already published `name` + `version` is rejected, so updating a
  listing means bumping the version input.
- The entries describe the hosted endpoints, not the code in this repository.
  Nothing here is deployed or restarted by a publish.

## What each listing says

Every generated entry carries the same shape:

- `name`: `io.github.pollinations/<id>`, matching the endpoint on the gateway.
- `description` and `title`: taken from `shared/registry/mcp.ts`, with overrides
  in `LISTING_OVERRIDES` for the fields the registry schema cannot take as-is.
  The schema caps `description` at 100 characters, so a server description that
  reads as dashboard copy is shortened there instead of in the shared registry.
- `remotes`: the streamable-http endpoint plus the `Authorization` header
  clients have to send, including the link to create the key. The 100 character
  description limit is why the key instructions live on the header.
- `websiteUrl`: the MCP setup docs.
- `repository`: this repository, so reviewers can inspect what serves the
  endpoint.
- `_meta`: the commit the entries were generated from, when the caller passes
  `--commit`.
