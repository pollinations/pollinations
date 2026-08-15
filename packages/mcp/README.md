# pollinations.ai MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server for pollinations.ai. Lets MCP-capable hosts (Claude Desktop, Cursor, Windsurf, …) generate text, images, video, audio, embeddings, and 3D models; inspect model health; and check Pollen balance.

All calls go through `https://gen.pollinations.ai` by default. Set `POLLINATIONS_BASE_URL` to use another compatible gateway. Models, voices, and pricing are read live from the registry — no hardcoded enums.

## Quick Start

For Streamable HTTP clients, connect to `https://mcp.pollinations.ai` and send
your API key as `Authorization: Bearer YOUR_KEY`.

The server can only use models and account features allowed by that key's
permissions, and it cannot spend beyond the key's budget. Configure both in
[API key settings](https://enter.pollinations.ai/keys); see
[Authentication](https://gen.pollinations.ai/docs#tag/-authentication).

Or run the server locally over stdio:

```bash
# Run directly with npx (no installation required)
npx @pollinations/mcp
```

Or install globally:

```bash
npm install -g @pollinations/mcp
pollinations-mcp
```

## Authentication

Get your API key at [enter.pollinations.ai](https://enter.pollinations.ai/keys), or use [BYOP](../../BRING_YOUR_OWN_POLLEN.md) to let users bring their own pollen (supports web redirects and [device flow](../../BRING_YOUR_OWN_POLLEN.md#clis--headless-apps-device-flow) for CLIs).

**Key types:**

- `pk_` (publishable) — client-safe, rate-limited (1 pollen per IP per hour)
- `sk_` (secret) — server-side only, no rate limits, can spend Pollen

For the local server, set your key via environment variable or the `setApiKey`
tool:

```bash
export POLLINATIONS_API_KEY=sk_your_key_here
npx @pollinations/mcp
```

To use a local or self-hosted compatible gateway:

```bash
export POLLINATIONS_BASE_URL=http://localhost:8788
npx @pollinations/mcp
```

## Available Tools

### Media Generation

| Tool            | API route                | MCP result         |
| --------------- | ------------------------ | ------------------ |
| `generateImage` | `/v1/images/generations` | Image resource link |
| `generateVideo` | `/video/{prompt}`        | Video resource link |
| `generate3D`    | `/3d/{prompt}`           | GLB resource link   |

Generated media is uploaded unlisted to `media.pollinations.ai` and returned as an MCP resource link, so binary data does not consume model context. Anyone with the unguessable URL can access it; uploads use the media service's 30-day lifecycle. To edit an image, pass its HTTP(S) URL in `image`. Generate multiple images with multiple tool calls rather than a separate batch contract.

### Text Generation

| Tool               | API route              | Description                                      |
| ------------------ | ---------------------- | ------------------------------------------------ |
| `generateText`     | `/v1/chat/completions` | Text, search, multimodal input, and tool calling |
| `createEmbeddings` | `/v1/embeddings`       | Text or multimodal vector embeddings             |

Use `generateText` with the appropriate model and message content for simple text, web search, image/video analysis, and tool calling.

### Audio

| Tool            | API route      | Description                      |
| --------------- | -------------- | -------------------------------- |
| `generateAudio` | `/audio/{text}` | Generate speech, music, or sound |

`generateAudio` returns an unlisted media resource link. Call `listModels` with `type=audio` for model and voice metadata.

### Discovery

| Tool             | API route              | Description                                  |
| ---------------- | ---------------------- | -------------------------------------------- |
| `listModels`     | Modality model routes  | Live models, capabilities, voices and pricing |
| `getModelStatus` | `/v1/models/status`    | Recent request counts, errors and latency    |

### Auth Tools

| Tool          | Description                          |
| ------------- | ------------------------------------ |
| `setApiKey`   | Set the API key for this session     |
| `getKeyInfo`  | Check stored key type/prefix (local) |
| `clearApiKey` | Remove the stored key                |

### Account

| Tool         | Description                                                                  |
| ------------ | ---------------------------------------------------------------------------- |
| `getBalance` | Remaining Pollen for the authenticated key (requires `account:usage`)        |

## Claude Desktop Integration

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "pollinations": {
      "command": "npx",
      "args": ["@pollinations/mcp"],
      "env": {
        "POLLINATIONS_API_KEY": "sk_your_key_here"
      }
    }
  }
}
```

## Examples

```text
Generate an image of a sunset over mountains using the flux model.

Create a 6-second video of waves crashing on a beach using veo.

Have a conversation about the weather with `generateText`, with the ability to call a weather API.

Generate audio saying "Hello, welcome to pollinations.ai!" using the nova voice.
```

## Testing

```bash
POLLINATIONS_API_KEY=sk_… npm run test
```

Without an API key, this runs an offline smoke test of the stdio connection, tool registration, and unauthenticated model listing through a local registry stub. With `POLLINATIONS_API_KEY`, it also exercises a small live slice (models, auth, chat, image URL, balance).

## System Requirements

- Node.js 20.0.0 or higher

## API Reference

All requests go through `POLLINATIONS_BASE_URL`, which defaults to `https://gen.pollinations.ai`. Full API docs: [gen.pollinations.ai/docs](https://gen.pollinations.ai/docs).

## License

MIT

## Links

- [pollinations.ai](https://pollinations.ai)
- [API Documentation](https://gen.pollinations.ai/docs)
- [GitHub Issues](https://github.com/pollinations/pollinations/issues)
