# Pollinations MCP

Use Pollinations tools from any
[Model Context Protocol](https://modelcontextprotocol.io) client that supports
Streamable HTTP. All hosted MCP servers are exposed through
`gen.pollinations.ai`.

## Quick start

Get an API key from [enter.pollinations.ai](https://enter.pollinations.ai/keys),
then choose a built-in server:

| Server | Streamable HTTP endpoint | Use it for |
| --- | --- | --- |
| Pollinations | `https://gen.pollinations.ai/mcp/pollinations` | Pollinations models, media generation, model discovery, and account tools |
| FFmpeg | `https://gen.pollinations.ai/mcp/ffmpeg` | Trim, convert, resize, compress, and remix audio and video |
| Exa Search | `https://gen.pollinations.ai/mcp/exa` | Search the live web and fetch clean page content |

Send the key with every request:

```http
Authorization: Bearer YOUR_KEY
```

The live catalog returns the same endpoints with current descriptions and
pricing:

```bash
curl https://gen.pollinations.ai/mcp
```

## Connect a client

The official TypeScript client handles initialization and tool discovery:

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

Other clients use the same endpoint and bearer header; only their configuration
format differs.

### Claude Code

```bash
claude mcp add --transport http pollinations \
  https://gen.pollinations.ai/mcp/pollinations \
  --header "Authorization: Bearer YOUR_KEY"
```

Run `/mcp` in Claude Code to verify the connection. Replace the name and URL
with another endpoint from the table to use FFmpeg or Exa Search.

## Pollinations MCP

The Pollinations server exposes the main Pollinations API as agent-friendly
tools.

### Discover models

| Tool | Purpose |
| --- | --- |
| `listModels` | List live models, aliases, capabilities, voices, endpoints, and pricing |
| `getModelStatus` | Inspect recent requests, errors, and latency for a model |

Use `listModels` before choosing a model or voice. The registry is live, so
clients should not rely on a hardcoded model list.

### Generate and transform

| Tool | Purpose |
| --- | --- |
| `generateText` | Generate text, use search-capable models, process multimodal input, or call a listed agent |
| `generateImage` | Generate or edit images |
| `generateVideo` | Generate video |
| `generateAudio` | Generate speech, music, or sound |
| `transcribeAudio` | Transcribe audio from a public HTTPS URL |
| `generate3D` | Generate a GLB 3D model |
| `createEmbeddings` | Create text or multimodal embeddings |

Generated media is uploaded unlisted to `media.pollinations.ai` and returned as
an MCP resource link, so binary data does not consume model context. Anyone
with the link can access it, and it expires after 30 days.

### Account

| Tool | Purpose |
| --- | --- |
| `getBalance` | Check the remaining Pollen balance; requires `account:usage` permission |

## FFmpeg MCP

`runFfmpeg` accepts public HTTPS media inputs and ordinary FFmpeg arguments. It
supports multiple inputs and returns the output as a hosted MCP resource link.
Pollinations supplies the input and output files, so omit the `ffmpeg`
executable and output path from the arguments.

## Exa Search MCP

- `web_search_exa` searches the live web and returns relevant pages with
  highlights.
- `web_fetch_exa` reads one or more known URLs as clean text when the search
  highlights are not enough.

## Billing and permissions

Calls use the same Pollen wallet as the Pollinations API. The catalog endpoint
shows each server's current pricing. Pollinations generation tools use the
selected model's listed rate.

The server can only use models and account features allowed by the caller's key
and cannot spend beyond that key's budget. Configure both in
[API key settings](https://enter.pollinations.ai/keys). See
[Authentication](https://gen.pollinations.ai/docs#tag/authentication) for key
types and security guidance.

## Development

Requires Node.js 20 or newer. Run the tests with:

```bash
npm test
```

Set `POLLINATIONS_API_KEY` to add live model, authentication, generation, and
balance checks.

The Pollinations MCP implementation lives in [`packages/mcp/`](./), with its
Cloudflare Worker in [`apps/mcp/`](../../apps/mcp/). Hosted MCP traffic is
routed through Gen.

API reference: [gen.pollinations.ai/docs](https://gen.pollinations.ai/docs) ·
Issues: [GitHub](https://github.com/pollinations/pollinations/issues) · License:
MIT
