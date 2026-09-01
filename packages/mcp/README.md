# pollinations.ai MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server for generating
text, images, video, audio, embeddings, and 3D models with Pollinations. It also
provides live model discovery, health information, and Pollen balance.

## Quick Start

Connect any Streamable HTTP client to `https://mcp.pollinations.ai` with:

```http
Authorization: Bearer YOUR_KEY
```

The server can only use models and account features allowed by that key's
permissions, and it cannot spend beyond the key's budget. Configure both in
[API key settings](https://enter.pollinations.ai/keys); see
[Authentication](https://gen.pollinations.ai/docs#tag/-authentication).

## Hosted MCP catalog

Pollinations also hosts other MCP servers. List their Streamable HTTP URLs and
pricing:

```bash
curl https://gen.pollinations.ai/mcp
```

Connect any MCP client directly to a returned `url` with the same bearer
header. Creating a Pollinations agent is not required, and API keys must not be
put in the URL. Calls use the same Pollen wallet and key permissions as the
Pollinations API; generation tools use the selected model's listed rate.

For example, with the official TypeScript client:

```ts
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const client = new Client({ name: "my-app", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(
  new URL("https://gen.pollinations.ai/mcp/pollinations"),
  {
    requestInit: {
      headers: {
        Authorization: `Bearer ${process.env.POLLINATIONS_API_KEY}`,
      },
    },
  },
);

await client.connect(transport);
const { tools } = await client.listTools();
```

The client handles MCP initialization and tool discovery. Other clients use the
same endpoint and header; only their configuration format differs.

### Claude Code

```bash
claude mcp add --transport http pollinations https://mcp.pollinations.ai \
  --header "Authorization: Bearer YOUR_KEY"
```

Run `/mcp` in Claude Code to verify the connection.

## Authentication

Get a key at [enter.pollinations.ai](https://enter.pollinations.ai/keys), or use
[BYOP](../../BRING_YOUR_OWN_POLLEN.md) to let users connect their own wallet
through a web or device flow.

**Key types:**

- `pk_` — client-safe and rate-limited to 1 Pollen per IP per hour
- `sk_` — server-side only and not rate-limited

## Available Tools

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

Generated media is uploaded unlisted to `media.pollinations.ai` and returned as
an MCP resource link, so binary data does not consume model context. Links are
public to anyone who has them and expire after 30 days. Pass an image's HTTPS
URL to edit it, and use separate tool calls for multiple images.

Models, voices, capabilities, and pricing come from the live registry rather
than hardcoded lists. Use `listModels` before selecting a model or voice.

## Development

Requires Node.js 20 or newer. Run the tests with:

```bash
npm test
```

Set `POLLINATIONS_API_KEY` to add live model, auth, text, image, and balance
checks.

The hosted Cloudflare Worker lives in [`apps/mcp/`](../../apps/mcp/) and is
deployed from `production` by
[`Deploy / Applications`](../../.github/workflows/deploy-applications.yml)
whenever `apps/mcp/` or `packages/mcp/` changes. It has no separate staging
deployment because it is a thin Gen proxy. Use the workflow's `mcp` target for
a manual redeploy.

API reference: [gen.pollinations.ai/docs](https://gen.pollinations.ai/docs) ·
Issues: [GitHub](https://github.com/pollinations/pollinations/issues) · License:
MIT
