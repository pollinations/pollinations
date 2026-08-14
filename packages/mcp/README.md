# pollinations.ai MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server for pollinations.ai. Lets MCP-capable hosts (Claude Desktop, Cursor, Windsurf, …) generate images, videos, text, and audio, plus check the authenticated key's Pollen balance and usage.

All calls go through `https://gen.pollinations.ai` by default. Set `POLLINATIONS_BASE_URL` to use another compatible gateway. Models, voices, and pricing are read live from the registry — no hardcoded enums.

## Quick Start

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

Set your key via environment variable or the `setApiKey` tool:

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

### Image & Video Generation

| Tool              | API route                | MCP result                                    |
| ----------------- | ------------------------ | --------------------------------------------- |
| `generateImage`   | `/v1/images/generations` | Image data or a resource link                 |
| `generateVideo`   | `/image/{prompt}`        | Embedded video resource                      |
| `listImageModels` | `/image/models`          | Live image/video registry, including pricing |

`generateImage` uses the API's `response_format`: `b64_json` returns an MCP image block (the API default), while `url` returns an MCP resource link. Generate multiple images with multiple tool calls rather than a separate batch contract.

### Text Generation

| Tool             | API route              | Description                                      |
| ---------------- | ---------------------- | ------------------------------------------------ |
| `chatCompletion` | `/v1/chat/completions` | Text, search, multimodal input, and tool calling |
| `listTextModels` | `/text/models`         | Live model registry, including voices/pricing   |

Use `chatCompletion` with the appropriate model and message content for simple text, web search, image/video analysis, and audio transcription.

### Audio

| Tool            | API route       | Description                     |
| --------------- | --------------- | ------------------------------- |
| `generateAudio` | `/audio/{text}` | Generate speech, music, or sound |

`generateAudio` returns an MCP audio block. Call `listTextModels` for model voice metadata.

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
| `getUsage`   | Per-request history, or daily aggregate when `daily: true` (`account:usage`) |
| `listQuests` | Quests and earned rewards for the authenticated account (`account:usage`)   |

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

Have a chatCompletion conversation about the weather, with the ability to call a weather API.

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
