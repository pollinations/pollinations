# pollinations.ai MCP Server v2.0

A Model Context Protocol (MCP) server for pollinations.ai that enables AI assistants to generate images, videos, text, and audio.

## What's New in v2.0

- **New API endpoint**: Uses `gen.pollinations.ai` - the unified pollinations.ai gateway
- **Authentication**: Simple API key system (pk*/sk* keys) replaces OAuth
- **Video generation**: New `generateVideo` tool with veo, seedance, seedance-pro
- **Chat completions**: OpenAI-compatible `chatCompletion` tool with function calling
- **Dynamic models**: Models fetched from API - always up to date, no hardcoding!
- **SDK upgrade**: Updated to MCP SDK 1.25.1 with latest protocol support

## Quick Start

```bash
# Run directly with npx (no installation required)
npx @pollinations/model-context-protocol
```

Or install globally:

```bash
npm install -g @pollinations/model-context-protocol
pollinations-mcp
```

## Authentication

Get your API key at [pollinations.ai](https://pollinations.ai)

**Key Types:**

- `pk_` (Publishable): Client-safe, rate-limited (1 pollen per IP per hour)
- `sk_` (Secret): Server-side only, no rate limits, can spend Pollen

Set your key via environment variable or the `setApiKey` tool:

```bash
# Environment variable
export POLLINATIONS_API_KEY=pk_your_key_here
npx @pollinations/model-context-protocol
```

## Available Tools

### Image & Video Generation

| Tool               | Description                                  |
| ------------------ | -------------------------------------------- |
| `generateImageUrl` | Generate an image URL from text prompt       |
| `generateImage`    | Generate image and return base64 data        |
| `generateVideo`    | Generate video (veo, seedance, seedance-pro) |
| `listImageModels`  | List available models (dynamic)              |

**Image parameters:**

- `prompt` (required): Text description
- `model`: flux, turbo, gptimage, kontext, seedream, seedream-pro, nanobanana, nanobanana-pro, zimage
- `width`, `height`: Image dimensions (default: 1024)
- `seed`: Reproducible results
- `enhance`: Improve prompt
- `negative_prompt`: What to avoid
- `quality`: low, medium, high, hd
- `image`: Reference image URL for image-to-image
- `transparent`: Transparent background

**Video parameters:**

- `model`: veo (text-to-video), seedance, seedance-pro (image-to-video)
- `duration`: Video length in seconds
- `aspectRatio`: 16:9, 9:16, etc.
- `audio`: Enable audio (veo only)

### Text Generation

| Tool             | Description                              |
| ---------------- | ---------------------------------------- |
| `generateText`   | Simple text generation                   |
| `chatCompletion` | OpenAI-compatible chat with tool calling |
| `listTextModels` | List available models (dynamic)          |

**Text models include:** openai, openai-fast, openai-large, gemini, gemini-fast, gemini-large, claude, claude-fast, claude-large, deepseek, grok, mistral, qwen-coder, and more!

**Chat completion features:**

- Multi-turn conversations
- Function/tool calling
- JSON response format
- Audio output (with openai-audio model)

### Audio Generation

| Tool              | Description               |
| ----------------- | ------------------------- |
| `respondAudio`    | AI responds with speech   |
| `sayText`         | Text-to-speech (verbatim) |
| `listAudioVoices` | List available voices     |

**Voices:** alloy, echo, fable, onyx, nova, shimmer, coral, verse, ballad, ash, sage, amuch, dan

**Formats:** mp3, wav, flac, opus, pcm16

### Authentication

| Tool          | Description              |
| ------------- | ------------------------ |
| `setApiKey`   | Set API key for requests |
| `getKeyInfo`  | Check current key status |
| `clearApiKey` | Remove stored key        |

## Claude Desktop Integration

```bash
npx @pollinations/model-context-protocol install-claude-mcp
```

Or manually add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "pollinations": {
      "command": "npx",
      "args": ["@pollinations/model-context-protocol"],
      "env": {
        "POLLINATIONS_API_KEY": "pk_your_key_here"
      }
    }
  }
}
```

## Examples

### Generate an image

```
Generate an image of a sunset over mountains using the flux model
```

### Generate a video

```
Create a 6-second video of waves crashing on a beach using veo
```

### Chat with function calling

```
Use chatCompletion to have a conversation about the weather, with the ability to call a weather API
```

### Text-to-speech

```
Say "Hello, welcome to pollinations.ai!" using the nova voice
```

## System Requirements

- **Node.js**: Version 18.0.0 or higher

## API Reference

All requests go through `https://gen.pollinations.ai`

| Endpoint                    | Description          |
| --------------------------- | -------------------- |
| GET `/image/{prompt}`       | Generate image/video |
| GET `/text/{prompt}`        | Generate text        |
| POST `/v1/chat/completions` | Chat completions     |
| GET `/image/models`         | List image models    |
| GET `/text/models`          | List text models     |

Full API docs: [enter.pollinations.ai/api/docs](https://enter.pollinations.ai/api/docs)

## Migration from v1.x

### Breaking Changes

1. **Authentication**: OAuth removed → Use API keys (pk*/sk*)
2. **Removed tools**: `startAuth`, `exchangeToken`, `refreshToken`, `getDomains`, `updateDomains`
3. **New tools**: `generateVideo`, `chatCompletion`, `setApiKey`, `getKeyInfo`, `clearApiKey`
4. **API endpoint**: Now uses `gen.pollinations.ai`

### Upgrade Steps

1. Get API key from [pollinations.ai](https://pollinations.ai)
2. Update: `npm update @pollinations/model-context-protocol`
3. Set your key: Use `setApiKey` tool or `POLLINATIONS_API_KEY` env var

## License

MIT

## Links

- [pollinations.ai](https://pollinations.ai)
- [API Documentation](https://enter.pollinations.ai/api/docs)
- [GitHub Issues](https://github.com/pollinations/pollinations/issues)
