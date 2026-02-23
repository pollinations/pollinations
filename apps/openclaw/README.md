# 🧬 Pollinations × OpenClaw

Use **25+ AI models** as your OpenClaw brain through a single API.

**Kimi K2.5** as default (256K context, vision, tools, reasoning), with DeepSeek, GLM-4.7, Gemini Flash Lite, and Claude Haiku as free alternatives. Premium models (Claude Sonnet, Gemini 3, Grok 4) available on paid tier.

## 30-Second Setup

**Step 1:** Get your API key (comes with free credits) at [enter.pollinations.ai](https://enter.pollinations.ai)

**Step 2:** Run the setup script:

```bash
curl -fsSL https://raw.githubusercontent.com/pollinations/pollinations/main/apps/openclaw/setup-pollinations.sh | bash -s -- YOUR_API_KEY
```

### Then install/restart OpenClaw:

```bash
openclaw onboard --install-daemon
```

- Use **Quickstart** onboarding mode
- Skip the Model/auth provider step (Pollinations is already configured)
- Choose "All Providers" → "Keep Current" for default model

## Available Models

Switch models anytime in chat with `/model pollinations/<name>`:

| Model | ID | Best for |
|---|---|---|
| **Kimi K2.5** ⭐ | `pollinations/kimi` | Agentic tasks, vision, reasoning (256K context) |
| **DeepSeek V3.2** | `pollinations/deepseek` | Strong reasoning & tool calling |
| **GLM-4.7** | `pollinations/glm` | Coding, reasoning, agentic workflows |
| **Gemini Flash Lite** | `pollinations/gemini-fast` | Fast, vision support |
| **Claude Haiku 4.5** | `pollinations/claude-fast` | Fast with good reasoning |
| **Claude Sonnet** 💰 | `pollinations/claude` | Complex reasoning (paid) |
| **Gemini 3** 💰 | `pollinations/gemini` | 1M context (paid) |
| **Grok 4** 💰 | `pollinations/grok` | Tool calling, fast (paid) |

## Manual Configuration

If you prefer to edit `~/.openclaw/openclaw.json` directly:

```json
{
  "env": { "POLLINATIONS_API_KEY": "sk_your_key_here" },
  "agents": {
    "defaults": {
      "model": {
        "primary": "pollinations/kimi",
        "fallbacks": ["pollinations/deepseek", "pollinations/glm"]
      },
      "models": {
        "pollinations/kimi": { "alias": "Kimi K2.5 (Pollinations)" },
        "pollinations/deepseek": { "alias": "DeepSeek V3.2 (Pollinations)" },
        "pollinations/glm": { "alias": "GLM-4.7 (Pollinations)" },
        "pollinations/gemini-fast": { "alias": "Gemini Flash Lite (Pollinations)" },
        "pollinations/claude-fast": { "alias": "Claude Haiku 4.5 (Pollinations)" }
      }
    }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "pollinations": {
        "baseUrl": "https://gen.pollinations.ai/v1",
        "apiKey": "${POLLINATIONS_API_KEY}",
        "api": "openai-completions",
        "models": [
          {
            "id": "kimi",
            "name": "Kimi K2.5",
            "reasoning": true,
            "input": ["text", "image"],
            "contextWindow": 256000,
            "maxTokens": 8192
          },
          {
            "id": "deepseek",
            "name": "DeepSeek V3.2",
            "input": ["text"],
            "contextWindow": 128000,
            "maxTokens": 8192
          },
          {
            "id": "glm",
            "name": "GLM-4.7",
            "input": ["text"],
            "contextWindow": 128000,
            "maxTokens": 8192
          }
        ]
      }
    }
  }
}
```

Add more models by adding entries to the `models` array. See all available models at [gen.pollinations.ai/v1/models](https://gen.pollinations.ai/v1/models).

## Why Pollinations?

- **Free credits included** — Sign up and start building immediately
- **25+ models, one API** — Kimi, DeepSeek, GLM, Gemini, Claude, and more
- **OpenAI-compatible** — Standard `/v1/chat/completions` endpoint, works with any OpenAI client
- **Unified API** — Same endpoint for text, image, video, and audio generation
- **Pay-as-you-go** — Only pay for what you use, top up anytime at [enter.pollinations.ai](https://enter.pollinations.ai)

## Layer 2: Pollinations Skill (Image/Video/Audio)

There's also a [Pollinations skill on ClawHub](https://github.com/openclaw/skills/blob/main/skills/isaacgounton/pollinations/SKILL.md) that gives your OpenClaw agent the ability to **generate images, videos, and audio**:

```
/skill install isaacgounton/pollinations
```

This adds capabilities like:
- 🖼️ Image generation (Flux, GPT Image, Seedream, Imagen 4...)
- 🎬 Video generation (Veo 3.1, Seedance, Wan...)
- 🔊 Text-to-speech (13 voices)
- 👁️ Image/video analysis

## Links

- **API Docs:** https://gen.pollinations.ai/api/docs
- **Get API Key:** https://enter.pollinations.ai
- **Text Models:** https://gen.pollinations.ai/v1/models
- **Image Models:** https://gen.pollinations.ai/image/models
- **GitHub:** https://github.com/pollinations/pollinations
