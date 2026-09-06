# pollinations.ai MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
Pollinations models and API capabilities as agent tools.

## Connect

Connect a Streamable HTTP client to:

```text
https://gen.pollinations.ai/mcp/pollinations
```

Send a Pollinations API key with every request:

```http
Authorization: Bearer YOUR_KEY
```

Get a key from [enter.pollinations.ai](https://enter.pollinations.ai/keys).
Calls use that key's Pollen wallet, permissions, and budget.

For all Pollinations-hosted MCP servers, see the
[MCP Servers documentation](https://gen.pollinations.ai/docs#tag/mcp-servers).

## Tools

| Tool | Purpose | API route |
| --- | --- | --- |
| `generateText` | Text, search, multimodal input, and tool calling | `/v1/chat/completions` |
| `generateImage` | Generate or edit images | `/v1/images/generations` |
| `generateVideo` | Generate video | `/video/{prompt}` |
| `generateAudio` | Generate speech, music, or sound | `/audio/{text}` |
| `transcribeAudio` | Transcribe a public HTTPS audio URL | `/v1/audio/transcriptions` |
| `generate3D` | Generate a GLB model | `/3d/{prompt}` |
| `createEmbeddings` | Create text or multimodal embeddings | `/v1/embeddings` |
| `listModels` | List live models, capabilities, voices, and pricing | Model registry routes |
| `getModelStatus` | Inspect recent requests, errors, and latency | `/v1/models/status` |
| `getBalance` | Check remaining Pollen; requires `account:usage` | `/account/balance` |

## Local device login

The stdio package lets an MCP host sign in without asking the user to paste an
API key into the conversation:

1. `startDeviceLogin` returns a browser approval URL and short user code.
2. `pollDeviceLogin` checks approval once and activates the session key.
3. `whoAmI` confirms the connected account.

The device code and resulting key stay inside the local MCP process. These
stateful tools are not exposed by the hosted stateless endpoint.

Generated media is uploaded unlisted to `media.pollinations.ai` and returned as
an MCP resource link, so binary data does not consume model context. Anyone
with the link can access it, and it expires after 30 days.

Models, voices, capabilities, and pricing come from the live registry. Use
`listModels` before selecting a model or voice.

## Development

Requires Node.js 20 or newer. Run the tests with:

```bash
npm test
```

Set `POLLINATIONS_API_KEY` to add live model, authentication, generation, and
balance checks.

The hosted Cloudflare Worker lives in [`apps/mcp/`](../../apps/mcp/) and is
routed through Gen.

Issues: [GitHub](https://github.com/pollinations/pollinations/issues) · License:
MIT
