# pollinations.ai MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server for pollinations.ai. Lets MCP-capable hosts (Claude Desktop, Cursor, Windsurf, …) generate images, videos, text, and audio, plus check the authenticated key's Pollen balance and usage.

All calls go through `https://gen.pollinations.ai`. Models, voices, and pricing are read live from the registry — no hardcoded enums.

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

Get your API key at [enter.pollinations.ai](https://enter.pollinations.ai), or use [BYOP](../../BRING_YOUR_OWN_POLLEN.md) to let users bring their own pollen (supports web redirects and [device flow](../../BRING_YOUR_OWN_POLLEN.md#clis--headless-apps-device-flow) for CLIs).

**Key types:**

- `pk_` (publishable) — client-safe, rate-limited (1 pollen per IP per hour)
- `sk_` (secret) — server-side only, no rate limits, can spend Pollen

Set your key via environment variable or the `setApiKey` tool:

```bash
export POLLINATIONS_API_KEY=sk_your_key_here
npx @pollinations/mcp
```

## Available Tools

### Image & Video Generation

| Tool                 | Description                                                |
| -------------------- | ---------------------------------------------------------- |
| `generateImageUrl`   | Generate a shareable image URL from a text prompt          |
| `generateImage`      | Generate an image and return base64 data                   |
| `generateImageBatch` | Generate multiple images in parallel (best with `sk_` keys)|
| `generateVideo`      | Generate a video and return base64 data                    |
| `generateVideoUrl`   | Generate a shareable video URL from a text prompt          |
| `describeImage`      | Vision analysis of an image URL                            |
| `analyzeVideo`       | Analyze YouTube videos or video URLs                       |
| `listImageModels`    | List available image & video models (live)                 |

Common image parameters: `prompt`, `model`, `width`, `height`, `seed`, `enhance`, `quality`, `image` (for image-to-image), `transparent`. Common video parameters: `model`, `duration`, `aspectRatio`, `audio`. Call `listImageModels` for the current model set and per-model capabilities.

### Text Generation

| Tool             | Description                                       |
| ---------------- | ------------------------------------------------- |
| `generateText`   | Simple text generation from a prompt              |
| `chatCompletion` | OpenAI-compatible chat completions + tool calling |
| `webSearch`      | Web-grounded answers (perplexity, gemini-search)  |
| `listTextModels` | List available text models (live)                 |
| `getPricing`     | Per-model pricing (text / image / audio)          |

Call `listTextModels` for the current model set, aliases, and capabilities (reasoning, tools, audio output, etc.).

### Audio

| Tool               | Description                              |
| ------------------ | ---------------------------------------- |
| `respondAudio`     | AI responds to a prompt with speech      |
| `sayText`          | Text-to-speech (verbatim)                |
| `transcribeAudio`  | Transcribe audio (gemini-large)          |
| `listAudioVoices`  | List available voices (live)             |

Call `listAudioVoices` for the current voice list. Output formats: mp3, wav, flac, opus, pcm16.

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

Say "Hello, welcome to pollinations.ai!" using the nova voice.
```

## Testing

```bash
POLLINATIONS_API_KEY=sk_… npm run test
```

Spawns the server over stdio, lists tools, and exercises a small live slice (auth, text, image URL, balance). Skips authenticated calls when the env var is unset.

## System Requirements

- Node.js 18.0.0 or higher

## API Reference

All requests go through `https://gen.pollinations.ai`. Full API docs: [gen.pollinations.ai/docs](https://gen.pollinations.ai/docs).

## License

MIT

## Links

- [pollinations.ai](https://pollinations.ai)
- [API Documentation](https://gen.pollinations.ai/docs)
- [GitHub Issues](https://github.com/pollinations/pollinations/issues)
