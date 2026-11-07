---
name: pollinations-mcp
description: Use the hosted Pollinations MCP servers from any MCP client. Use when an agent needs web search, Linux sandboxes, a persistent computer, calculators, DNS or network lookups, package and research data, media trimming, community connectors, or Pollinations text/image/audio generation as MCP tools, or when asked to add a Pollinations MCP server to Claude Code, Codex, Cursor, or another MCP client.
---

# Pollinations MCP servers

Pollinations hosts stateless **MCP** servers that any MCP client can call over
Streamable HTTP. One Pollinations key (`sk_...`) unlocks every server; there is
no per-server sign-up.

## Discover

- Live catalog (JSON: `id`, `name`, `description`, `url`, `pricing`):
  `GET https://gen.pollinations.ai/mcp`
- Server Cards (SEP-2127 AI Catalog): `https://gen.pollinations.ai/.well-known/ai-catalog.json`,
  and per server at `https://gen.pollinations.ai/mcp/<id>/server-card`.
- A server's endpoint is always `https://gen.pollinations.ai/mcp/<id>`.

## Servers

| id | what it does |
| --- | --- |
| `pollinations` | Pollinations text, image, audio, video and discovery tools. |
| `exa` | Live web search and clean page fetch. |
| `calculators` | Time/zones, cron, Unicode, color contrast, QR codes, currency. |
| `network` | Public DNS, HTTP diagnostics, subnets, RDAP registration data. |
| `packages` | Package versions, vulnerabilities, Hugging Face models/Spaces. |
| `news` | Hacker News, RSS/Atom feeds, archived snapshots, USGS earthquakes. |
| `research` | Wikipedia, Wiktionary, Wikidata, RFCs, biomedical and World Bank data. |
| `ffmpeg` | Trim, convert, resize, compress, remix audio and video. |
| `ask-jev` | Typed decision questions (choice, score, probability). |
| `computer` | A private persistent computer: files that survive runs, bash, JavaScript. |
| `machines` | Ephemeral Linux sandboxes for commands and files. |
| `composio` | Connectors for Gmail, GitHub, Sheets and Slack (each user links their own). |

Match the task to the narrowest server. Generation goes to `pollinations`;
deterministic math to `calculators`; live facts to `exa` or `research`.

## Connect

Claude Code:

```bash
claude mcp add --transport http pollinations https://gen.pollinations.ai/mcp/pollinations \
  --header "Authorization: Bearer $POLLINATIONS_API_KEY"
```

Any `mcpServers` config (Codex, Cursor, and others):

```json
{
  "mcpServers": {
    "pollinations": {
      "type": "http",
      "url": "https://gen.pollinations.ai/mcp/pollinations",
      "headers": { "Authorization": "Bearer ${POLLINATIONS_API_KEY}" }
    }
  }
}
```

Verify with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector),
or by listing tools from the client. A missing or wrong key returns `401`;
inspect it at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys).

## Billing

Each call is billed per the server's `pricing` in the catalog (some per tool
call, some at the downstream model or provider rate). Read the catalog before
choosing a paid server. The key's budget and the caller's Pollen balance both
apply, so a `402` can mean either.