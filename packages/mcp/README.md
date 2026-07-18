# pollinations.ai MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server for generating images, videos, text, and audio with pollinations.ai, plus checking Pollen balance and usage.

All requests go through `https://gen.pollinations.ai`. Gen owns model defaults, aliases, capabilities, validation, and errors; the MCP server keeps a small tool surface and wraps responses for MCP.

## Quick Start

Get a key from [enter.pollinations.ai](https://enter.pollinations.ai/keys), set it in the server process environment, and start the server:

```bash
export POLLINATIONS_API_KEY=sk_your_key_here
npx @pollinations/mcp
```

The key is read only from `POLLINATIONS_API_KEY`. There are no authentication tools because API keys must not be passed through model-visible tool arguments or conversation content.

## Available Tools

### Image and Video

| Tool | Description |
| --- | --- |
| `generateImageUrl` | Generate an image and return its URL |
| `generateImage` | Generate an image and return base64 data |
| `generateVideo` | Generate a video and return base64 data |
| `generateVideoUrl` | Generate a video and return its URL |

Video generation requires an explicit video model so Gen cannot fall back to its default image model.

### Text

| Tool | Description |
| --- | --- |
| `chatCompletion` | Proxy an OpenAI-compatible chat completion and return raw Gen JSON |
| `listModels` | Return Gen's live registry for all model types |

Use `chatCompletion` for simple prompts, multi-turn chat, reasoning, tool calling, search, and image/video/audio analysis.

### Audio

| Tool | Description |
| --- | --- |
| `respondAudio` | Generate a spoken response to a prompt |
| `sayText` | Speak text verbatim |

### Account

| Tool | Description |
| --- | --- |
| `getBalance` | Get the key budget or, with `account:usage`, account balances |
| `getUsage` | Get usage for the authenticated key |

The model registry responses include the current names, aliases, capabilities, and pricing supplied by Gen.

## Claude Desktop Integration

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

## Testing

```bash
npm test
POLLINATIONS_API_KEY=sk_… npm test
```

The smoke test always lists tools and models. With a key, it also exercises chat completion, image URL generation, and balance.

## Requirements and Links

- Node.js 18 or later
- [API documentation](https://gen.pollinations.ai/docs)
- [GitHub issues](https://github.com/pollinations/pollinations/issues)

MIT
