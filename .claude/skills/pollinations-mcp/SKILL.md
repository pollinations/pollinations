---
name: pollinations-mcp
description: Use the hosted Pollinations MCP server to call text, image, video, audio, 3D and embedding generation as agent tools, plus model, balance, usage, earnings, quest and key management. Use when an MCP client (Claude, Cursor, Codex, an SDK, or another agent) should call Pollinations through tools instead of raw HTTP, or when wiring the server URL and Authorization header.
---
# pollinations-mcp — Pollinations as agent tools

Pollinations hosts a Streamable-HTTP MCP server that exposes the whole API as
tools. Prefer it over raw REST when the environment speaks MCP: the tools
discover models, return media as links (so binary never enters model context),
and reuse the same key, wallet and budget as the REST API.

## Connect

```text
URL:    https://gen.pollinations.ai/mcp/pollinations
Header: Authorization: Bearer YOUR_KEY
```

Get a key at `https://enter.pollinations.ai/keys`. Calls use that key's Pollen
wallet, permissions and budget. All Pollinations-hosted MCP servers are listed
under the MCP Servers section of `https://gen.pollinations.ai/docs`.

## Tools

| Tool | Use it for | Needs |
| --- | --- | --- |
| `generateText` | text, search, multimodal input, tool calling | — |
| `generateImage` | generate or edit an image | — |
| `generateVideo` | text-to-video | — |
| `generateAudio` | speech, music, sound | — |
| `transcribeAudio` | transcribe a public HTTPS audio URL | — |
| `generate3D` | produce a GLB model | — |
| `createEmbeddings` | text or multimodal embeddings | — |
| `listModels` | search live models, voices, capabilities, pricing | — |
| `getModelStatus` | recent requests, errors, latency | — |
| `getBalance` | remaining Pollen | `account:usage` |
| `getUsage` | request history / daily summary | `account:usage` |
| `getEarnings` | developer earnings from BYOP apps and community models | `account:usage` |
| `listQuests` | quests with reward and claim state | `account:usage` |
| `listKeys` | list the account's API keys | `account:keys` |
| `createKey` | create a secret or publishable app key | `account:keys` |
| `revokeKey` | revoke a key by id | `account:keys` |

## Rules that matter

- **Discover before choosing.** `listModels` reads the live registry; pass
  `query`, `capabilities`, `agent`, `community` or `limit` to narrow. Do not
  hardcode a model or voice id.
- **Media comes back as a resource link.** Generated files use the API's public
  Media URL, so nothing is downloaded or re-uploaded and binary data does not
  consume context. Anyone with the link can open it; expired files return 404.
- **Permissions are the key's.** `getBalance`, `getUsage`, `getEarnings` and
  `listQuests` need `account:usage`; `listKeys`, `createKey`, `revokeKey` need
  `account:keys`. A key without the scope gets a permission error, not data.
- **One wallet.** Spending, caching and billing match the REST path exactly, so
  mixing MCP and REST on the same key is safe.

## When to use this vs the REST skill

- Use **this** skill when the client is an MCP host (Claude Desktop, Cursor,
  an agent framework) and wants tools.
- Use **`pollinations-api`** when only curl/fetch is available or the CLI cannot
  be installed.
- Use **`polli`** when the Pollinations CLI is already installed.

Full tool schemas and request bodies: `https://gen.pollinations.ai/docs#tag/mcp-servers`.