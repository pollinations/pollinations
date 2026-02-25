# 🧬 Pollinations × OpenClaw

Use **25+ AI models** as your OpenClaw brain through a single API.

**Kimi K2.5** as default (256K context, vision, tools, reasoning), with DeepSeek, GLM-5, GPT-5 Mini, Gemini Flash Lite, Claude Haiku, Mistral, Qwen Coder, MiniMax, Nova, and more as free alternatives. Premium models (GPT-5.2, Claude Sonnet/Opus, Gemini 3 Flash/Pro, Grok 4) available on paid tier.

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

**Free models:**

| Model | ID | Best for |
|---|---|---|
| **Kimi K2.5** ⭐ | `pollinations/kimi` | Agentic tasks, vision, reasoning (256K context) |
| **DeepSeek V3.2** | `pollinations/deepseek` | Efficient reasoning & agentic AI |
| **GLM-5** | `pollinations/glm` | 744B MoE, long context reasoning (198K) |
| **GPT-5 Mini** | `pollinations/openai` | Fast & balanced, vision |
| **GPT-5 Nano** | `pollinations/openai-fast` | Ultra fast & affordable |
| **GPT-4o Audio** | `pollinations/openai-audio` | Voice input & output |
| **Gemini Flash Lite** | `pollinations/gemini-fast` | Ultra fast, vision, search |
| **Gemini + Search** | `pollinations/gemini-search` | Web search grounded answers |
| **Claude Haiku 4.5** | `pollinations/claude-fast` | Fast & intelligent |
| **Mistral Small 3.2** | `pollinations/mistral` | Efficient & cost-effective |
| **Qwen3 Coder** | `pollinations/qwen-coder` | Specialized for code generation |
| **MiniMax M2.1** | `pollinations/minimax` | Multi-language & agent workflows (200K) |
| **Nova Micro** | `pollinations/nova-fast` | Ultra fast & ultra cheap |
| **Perplexity Sonar** | `pollinations/perplexity-fast` | Fast web search |
| **Perplexity Reasoning** | `pollinations/perplexity-reasoning` | Advanced reasoning + web search |
| **NomNom** | `pollinations/nomnom` | Web research with search, scrape & crawl |
| **Polly** | `pollinations/polly` | Pollinations AI assistant with code search & web |

**Paid models:**

| Model | ID | Best for |
|---|---|---|
| **GPT-5.2** 💰 | `pollinations/openai-large` | Most powerful & intelligent (reasoning) |
| **Claude Sonnet 4.6** 💰 | `pollinations/claude` | Most capable & balanced |
| **Claude Opus 4.6** 💰 | `pollinations/claude-large` | Most intelligent model |
| **Gemini 3 Flash** 💰 | `pollinations/gemini` | Pro-grade reasoning at flash speed |
| **Gemini 3 Pro** 💰 | `pollinations/gemini-large` | 1M context, vision, audio & video |
| **Grok 4 Fast** 💰 | `pollinations/grok` | High speed & real-time |

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
          { "id": "kimi", "name": "Kimi K2.5", "reasoning": true,
            "input": ["text", "image"], "contextWindow": 256000 },
          { "id": "deepseek", "name": "DeepSeek V3.2", "reasoning": true,
            "input": ["text"], "contextWindow": 128000 },
          { "id": "glm", "name": "GLM-5", "reasoning": true,
            "input": ["text"], "contextWindow": 198000 }
        ]
      }
    }
  }
}
```

This is a minimal example with 3 models. The setup script configures all 23 models automatically. See all available models at [gen.pollinations.ai/v1/models](https://gen.pollinations.ai/v1/models).

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
