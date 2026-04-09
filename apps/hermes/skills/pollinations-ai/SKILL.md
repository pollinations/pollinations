---
name: pollinations-ai
description: >
  Generate images, video, audio (TTS), and text using the Pollinations.ai API.
  Use when the user wants to create images from text prompts, generate speech,
  create videos, switch AI models, or needs multi-modal AI generation.
license: MIT
metadata:
  author: pollinations
  version: "1.0"
  hermes:
    tags: [Image-Generation, Text-to-Speech, Video-Generation, Audio, Multi-Modal, API, Free-Tier]
    required_environment_variables:
      - name: POLLINATIONS_API_KEY
        prompt: "Enter your Pollinations API key (optional, get one free at enter.pollinations.ai)"
        help: "https://enter.pollinations.ai"
        required_for: "Higher rate limits and premium models"
---

# Pollinations.ai - Multi-Modal AI Generation

## When to Use

Activate this skill when the user:
- Wants to **generate an image** from a text description
- Asks for **text-to-speech** or audio generation
- Wants to **generate a video** from a prompt
- Needs **text/chat completions** via an OpenAI-compatible API
- Asks to **list available models** or switch models
- Wants to **generate music** from a description
- Needs **multi-modal AI generation** (image + text + audio + video in one workflow)
- Mentions "Pollinations", "gen.pollinations.ai", or the Pollinations MCP

## Quick Reference

Five essential commands:

```bash
# 1. Generate an image
curl 'https://gen.pollinations.ai/image/a%20cyberpunk%20city%20at%20sunset?model=flux&width=1024&height=1024' \
  -H 'Authorization: Bearer $POLLINATIONS_API_KEY' -o image.jpg

# 2. Chat completion (OpenAI-compatible)
curl https://gen.pollinations.ai/v1/chat/completions \
  -H 'Authorization: Bearer $POLLINATIONS_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"model":"openai","messages":[{"role":"user","content":"Explain quantum computing in 3 sentences"}]}'

# 3. Text-to-speech
curl 'https://gen.pollinations.ai/audio/Hello%20world%20from%20Pollinations?voice=nova' \
  -H 'Authorization: Bearer $POLLINATIONS_API_KEY' -o speech.mp3

# 4. Generate a video
curl 'https://gen.pollinations.ai/video/a%20cat%20walking%20on%20the%20moon?model=wan' \
  -H 'Authorization: Bearer $POLLINATIONS_API_KEY' -o video.mp4

# 5. List all available models
curl https://gen.pollinations.ai/v1/models
```

## Authentication

Two key types available from [enter.pollinations.ai](https://enter.pollinations.ai):

| Type        | Prefix | Use case         | Rate limits      |
|-------------|--------|------------------|------------------|
| Secret      | `sk_`  | Server-side apps | None             |
| Publishable | `pk_`  | Client-side apps | 1 pollen/IP/hour |

```bash
# Header (recommended)
curl -H "Authorization: Bearer $POLLINATIONS_API_KEY" ...

# Query parameter (alternative)
curl "https://gen.pollinations.ai/text/hello?key=$POLLINATIONS_API_KEY"
```

## Image Generation

**Endpoint:** `GET https://gen.pollinations.ai/image/{prompt}`

### Parameters

| Parameter  | Type    | Default  | Description                                  |
|------------|---------|----------|----------------------------------------------|
| `model`    | string  | `zimage` | Model to use (see table below)               |
| `width`    | integer | 1024     | Image width in pixels                        |
| `height`   | integer | 1024     | Image height in pixels                       |
| `seed`     | integer | random   | Reproducible generation seed                 |
| `nologo`   | boolean | false    | Remove Pollinations watermark                |
| `enhance`  | boolean | false    | Auto-enhance prompt with more detail         |
| `negative` | string  | none     | Negative prompt (what to avoid)              |

### Image Models

| Model             | Best for                          | Notes                     |
|-------------------|-----------------------------------|---------------------------|
| `zimage`          | General purpose (default)         | Fast, good quality        |
| `flux`            | High-quality artistic images      | Excellent prompt following|
| `gptimage`        | Photorealistic, text in images    | OpenAI-powered            |
| `gptimage-large`  | Highest quality photorealism      | Paid only                 |
| `kontext`         | Image editing with context        | Supports reference images |
| `seedream5`       | Creative, stylized images         | Google-powered            |
| `klein`           | Fast generation                   | Lightweight               |
| `nova-canvas`     | AWS Nova image generation         | Amazon-powered            |
| `wan-image`       | Wan model for images              | Alibaba-powered           |
| `qwen-image`      | Qwen-powered image generation     | Alibaba-powered           |
| `grok-imagine`    | xAI Grok image generation         | xAI-powered               |

### Examples

```bash
# Basic image
curl 'https://gen.pollinations.ai/image/a%20mountain%20landscape%20at%20dawn' \
  -H 'Authorization: Bearer $POLLINATIONS_API_KEY' -o landscape.jpg

# Specific model, size, and seed for reproducibility
curl 'https://gen.pollinations.ai/image/portrait%20of%20a%20robot?model=flux&width=768&height=1024&seed=42' \
  -H 'Authorization: Bearer $POLLINATIONS_API_KEY' -o robot.jpg

# With negative prompt and enhanced prompting
curl 'https://gen.pollinations.ai/image/a%20serene%20lake?model=flux&enhance=true&negative=blurry,low%20quality' \
  -H 'Authorization: Bearer $POLLINATIONS_API_KEY' -o lake.jpg

# Use in HTML (no auth needed for free tier)
# <img src="https://gen.pollinations.ai/image/a%20cat%20in%20space" />
```

## Text Generation

**Endpoint:** `POST https://gen.pollinations.ai/v1/chat/completions`

Fully OpenAI-compatible. Use any OpenAI SDK by setting `base_url` to `https://gen.pollinations.ai`.

### Basic Chat Completion

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is the capital of France?"}
    ]
  }'
```

### Streaming

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "stream": true,
    "messages": [{"role": "user", "content": "Write a haiku about coding"}]
  }'
```

### Function Calling

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [{"role": "user", "content": "What is the weather in Tokyo?"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "parameters": {
          "type": "object",
          "properties": {"location": {"type": "string"}},
          "required": ["location"]
        }
      }
    }]
  }'
```

### Simple Text (GET)

```bash
# Quick single-prompt generation
curl 'https://gen.pollinations.ai/text/Explain%20gravity%20in%20one%20sentence?model=openai' \
  -H 'Authorization: Bearer $POLLINATIONS_API_KEY'
```

### Text Models

| Model            | Best for                      | Context  | Tools | Notes               |
|------------------|-------------------------------|----------|-------|---------------------|
| `openai`         | General purpose (default)     | 128K     | Yes   | GPT-5.4-nano        |
| `openai-large`   | Complex reasoning             | 128K     | Yes   | GPT-5.4             |
| `openai-fast`    | Speed-optimized               | 128K     | Yes   | GPT-5-nano          |
| `kimi`           | Long context, reasoning       | 256K     | Yes   | Kimi-K2.5           |
| `deepseek`       | Coding, math                  | 128K     | Yes   | DeepSeek            |
| `gemini`         | General purpose               | 128K     | Yes   | Google Gemini       |
| `gemini-large`   | Long context                  | 1M       | Yes   | Gemini Pro          |
| `gemini-search`  | Web-grounded answers          | 128K     | Yes   | Search built-in     |
| `claude`         | Nuanced writing               | 200K     | Yes   | Anthropic Claude    |
| `claude-fast`    | Fast Claude responses         | 200K     | Yes   | Claude Haiku-class  |
| `claude-large`   | Complex analysis              | 200K     | Yes   | Claude Opus-class   |
| `glm`            | General purpose               | 128K     | Yes   | GLM model           |

### OpenAI SDK Integration

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://gen.pollinations.ai",
    api_key="YOUR_POLLINATIONS_API_KEY"  # or os.environ["POLLINATIONS_API_KEY"]
)

response = client.chat.completions.create(
    model="openai",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://gen.pollinations.ai",
  apiKey: process.env.POLLINATIONS_API_KEY,
});

const response = await client.chat.completions.create({
  model: "openai",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(response.choices[0].message.content);
```

## Audio / Text-to-Speech

**Endpoint:** `GET https://gen.pollinations.ai/audio/{text}`

### Parameters

| Parameter      | Type    | Default | Description                              |
|----------------|---------|---------|------------------------------------------|
| `voice`        | string  | `nova`  | Voice to use (see list below)            |
| `model`        | string  | TTS     | Use `elevenmusic` for music generation   |
| `format`       | string  | `mp3`   | Output format: mp3, opus, aac, flac, wav |
| `duration`     | integer | auto    | Music duration in seconds (3-300)        |
| `instrumental` | boolean | false   | Instrumental-only music (no vocals)      |

### Available Voices

**OpenAI voices:** alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse

**ElevenLabs voices:** rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, matilda, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill

### Examples

```bash
# Text-to-speech with specific voice
curl 'https://gen.pollinations.ai/audio/Welcome%20to%20Pollinations?voice=shimmer' \
  -H 'Authorization: Bearer $POLLINATIONS_API_KEY' -o welcome.mp3

# Different format
curl 'https://gen.pollinations.ai/audio/Hello%20world?voice=alloy&format=wav' \
  -H 'Authorization: Bearer $POLLINATIONS_API_KEY' -o hello.wav

# Music generation
curl 'https://gen.pollinations.ai/audio/upbeat%20jazz%20piano?model=elevenmusic&duration=30&instrumental=true' \
  -H 'Authorization: Bearer $POLLINATIONS_API_KEY' -o jazz.mp3
```

### Transcription

```bash
curl https://gen.pollinations.ai/v1/audio/transcriptions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -F file=@recording.mp3
```

## Video Generation

**Endpoint:** `GET https://gen.pollinations.ai/video/{prompt}`

### Parameters

| Parameter     | Type    | Default | Description                                   |
|---------------|---------|---------|-----------------------------------------------|
| `model`       | string  | `wan`   | Video model to use                            |
| `duration`    | integer | auto    | Video length in seconds                       |
| `aspectRatio` | string  | `16:9`  | Aspect ratio (16:9, 9:16, 1:1)               |
| `audio`       | boolean | false   | Enable soundtrack generation                  |
| `image`       | string  | none    | Reference image URL (for start/end frames)    |

### Video Models

| Model            | Best for                        | Notes                  |
|------------------|---------------------------------|------------------------|
| `wan`            | General video (default)         | Alibaba Wan            |
| `wan-fast`       | Quick video generation          | Faster, lower quality  |
| `veo`            | High-quality cinematic video    | Google Veo             |
| `seedance`       | Dance and motion videos         | Specialized motion     |
| `seedance-pro`   | Premium dance/motion            | Higher quality         |
| `ltx-2`          | Fast lightweight video          | LTX model              |
| `grok-video-pro` | xAI video generation            | Grok-powered           |
| `nova-reel`      | AWS Nova video                  | Amazon-powered         |

### Examples

```bash
# Basic video generation
curl 'https://gen.pollinations.ai/video/a%20rocket%20launching%20into%20space?model=wan' \
  -H 'Authorization: Bearer $POLLINATIONS_API_KEY' -o rocket.mp4

# Vertical video with audio
curl 'https://gen.pollinations.ai/video/ocean%20waves%20on%20a%20beach?model=veo&aspectRatio=9:16&audio=true' \
  -H 'Authorization: Bearer $POLLINATIONS_API_KEY' -o beach.mp4

# With reference image (image-to-video)
curl 'https://gen.pollinations.ai/video/make%20this%20scene%20come%20alive?model=wan&image=https://example.com/photo.jpg' \
  -H 'Authorization: Bearer $POLLINATIONS_API_KEY' -o animated.mp4
```

## Model Discovery

```bash
# All models (OpenAI-compatible format)
curl https://gen.pollinations.ai/v1/models

# Image and video models with pricing/capabilities
curl https://gen.pollinations.ai/image/models

# Text models with context lengths and features
curl https://gen.pollinations.ai/text/models

# Audio models
curl https://gen.pollinations.ai/audio/models
```

## Prompt Engineering Tips for Images

1. **Be specific:** "a red fox sitting in a snowy forest at twilight, photorealistic" beats "a fox"
2. **Include style keywords:** "oil painting", "watercolor", "3D render", "photograph", "anime style"
3. **Specify lighting:** "golden hour lighting", "dramatic shadows", "soft diffused light"
4. **Use the `enhance` parameter** to let the API auto-improve vague prompts
5. **Use `negative` prompts** to exclude unwanted elements: `negative=blurry,watermark,text,low quality`
6. **Set a `seed`** for reproducible results -- iterate on prompts while keeping composition stable
7. **Match model to task:** `flux` for artistic images, `gptimage` for photorealism and text rendering

## MCP Server

Pollinations also provides an MCP (Model Context Protocol) server for direct integration with AI agents:

```bash
# Install as MCP server
npx -y @pollinations_ai/model-context-protocol

# Or add to Hermes
hermes mcp add pollinations -- npx -y @pollinations_ai/model-context-protocol
```

This gives agents direct tool access to image, text, audio, and video generation without writing curl commands.

## Verification Steps

After generating content, verify success:

1. **Image:** Check HTTP 200 and that the response `Content-Type` is `image/jpeg` or `image/png`. File should be > 1KB.
2. **Text:** Parse the JSON response. Check `choices[0].message.content` is non-empty.
3. **Audio:** Check HTTP 200 and that the file is > 1KB. Play it back to confirm audio quality.
4. **Video:** Check HTTP 200 and file is > 100KB. Video generation can take 30-120 seconds.
5. **Errors:** All errors return JSON `{"status": N, "error": {"code": "...", "message": "..."}}`.

Common error codes:
- `401` - Missing or invalid API key
- `402` - Insufficient pollen balance (top up at enter.pollinations.ai)
- `400` - Invalid parameters
- `500` - Server error (retry after a few seconds)
