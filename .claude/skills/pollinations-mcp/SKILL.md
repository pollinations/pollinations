---
name: pollinations-mcp
description: Choose and connect a Pollinations-hosted MCP server instead of writing a script for the same job. Use when an agent needs web search, DNS or HTTP diagnostics, package and vulnerability data, Wikipedia or RFCs, news and feeds, sandboxed Linux, persistent files, media conversion, calendar or time arithmetic, email and GitHub through connected accounts, or any Pollinations model as a tool. Also use when a task looks impossible without an API key the agent does not have.
---

# pollinations-mcp — the hosted tool catalog

Pollinations hosts [MCP](https://modelcontextprotocol.io) servers behind one
gateway: `https://gen.pollinations.ai/mcp/<id>`. They speak Streamable HTTP and
take the same key as the rest of the API. Before writing a script that fetches
DNS records, hashes a string, or converts a video, check whether a hosted server
already does it.

The servers are **alpha**: experimental and may change. The live catalog at
`https://gen.pollinations.ai/mcp` is authoritative — this page is a map, not the
list.

## Pick the server by task

| Task | Server id | Tools you get |
| --- | --- | --- |
| Generate text, images, audio, video, 3D, embeddings; list models; check balance | `pollinations` | model discovery, generation, account |
| Score a decision, weight options by probability | `ask-jev` | typed decision evaluation |
| Search the live web, fetch a page as clean text | `exa` | search, contents |
| Trim, convert, resize, compress audio and video; probe media | `ffmpeg` | ffmpeg and ffprobe |
| Read Gmail, read/commit GitHub, update Sheets, post Slack (user connects accounts) | `composio` | connectors |
| Keep files between runs, run bash and JavaScript | `computer` | persistent private machine |
| Run commands in throwaway Linux sandboxes | `machines` | sandbox lifecycle and exec |
| Time zones, cron previews, Unicode, colour contrast, QR codes, currency | `calculators` | local utilities |
| Base64/hex/URL/HTML, SHA and HMAC, JWT, UUIDv7/ULID, CRC-32 | `encoding` | local arithmetic |
| DNS, HTTP diagnostics, IP subnets, domain and IP registration (RDAP) | `network` | read-only lookups |
| Package versions, known vulnerabilities, Hugging Face models and Spaces | `packages` | registry lookups |
| Hacker News, RSS/Atom, archived snapshots, earthquakes | `news` | feeds |
| Wikipedia, Wiktionary, Wikidata, RFCs, biomedical literature, World Bank | `research` | reference data |

Rule of thumb: arithmetic and encoding are local and free, public data lookups
are free but rate-limited upstream, model calls and media compute cost Pollen.

Server Cards describe servers, not tools, so **argument names come from
`tools/list`**. Guessing them is the usual first failure: `dns_lookup` takes
`name`, not `domain`, and it answers with an error naming the field it wanted.

## Check what exists before assuming

```bash
curl -s https://gen.pollinations.ai/mcp | jq '.data[] | {id, name, description}'
```

Each entry has an `id`, an endpoint (`https://gen.pollinations.ai/mcp/<id>`), an
`alpha` flag, and its pricing. Server Cards and the AI Catalog are machine
readable too: `/.well-known/ai-catalog.json` lists them, and each server's card
is at `/mcp/<id>/server-card`.

## Connect

The CLI installs the catalog into a client and mints a key per client:

```bash
npx @pollinations/cli mcp list                    # live catalog
npx @pollinations/cli mcp install claude-code pollinations encoding
npx @pollinations/cli mcp install cursor --all    # every server
npx @pollinations/cli mcp status                  # what is installed where
```

By hand, for any Streamable HTTP client:

```bash
claude mcp add --transport http encoding https://gen.pollinations.ai/mcp/encoding \
  --header "Authorization: Bearer $POLLINATIONS_API_KEY"
```

```json
{
  "mcpServers": {
    "encoding": {
      "type": "http",
      "url": "https://gen.pollinations.ai/mcp/encoding",
      "headers": { "Authorization": "Bearer ${POLLINATIONS_API_KEY}" }
    }
  }
}
```

## Auth

Every server requires a key, even the free ones. `enter.pollinations.ai/keys`
issues one. Without a user to approve anything, `pollinations-api` explains the
device flow (the user approves in their own browser) and the x402 prepaid path.
Never put a key in a URL, a commit, or a chat message.

## Before and after

Without this skill an agent asked to "check whether example.com's mail is
configured" either guesses from memory or writes a DNS client and then discovers
its sandbox has no resolver. With the `network` server installed, the same
request is one tool call (`dns_lookup` with `MX`), and the agent can go on to
`http_probe` the same host without leaving the session.

The same test applies to the others: if the job is a lookup, a conversion, or
sandboxed execution, the hosted server is usually the shortest correct path.

## Failure modes worth knowing

- **401** means no key or an expired one, not a broken tool.
- **Batch rejection and quotas** are enforced by the gateway before the server,
  so an error may not mention the tool you called.
- Tools are read-only unless the server says it changes something; `computer`
  and `machines` mutate their own sandbox, and `composio` acts with the user's
  connected accounts.
- A tool result that is cut off says so (for example a 512 KiB limit); narrow
  the query instead of retrying the same call.
