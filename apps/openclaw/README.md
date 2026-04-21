# Pollinations x OpenClaw

Use **25+ AI models** as your OpenClaw brain through a single API.

**Kimi K2.5** as default (256K context, vision, tools, reasoning), with DeepSeek, GLM-4.7, and Claude Haiku as free alternatives. Premium models (Claude Opus, Gemini 3 Pro) available on paid tier.

## Setup

**Step 1:** Get your API key (comes with free credits) at [enter.pollinations.ai](https://enter.pollinations.ai)

**Step 2:** Run the setup script (requires `jq`):

```bash
curl -fsSL https://raw.githubusercontent.com/pollinations/pollinations/main/apps/openclaw/setup-pollinations.sh | bash -s -- YOUR_API_KEY
```

This works for both fresh installs and existing OpenClaw setups. It:
- Runs `openclaw onboard` for fresh installs (creates config + workspace)
- Adds the Pollinations provider with 7 models to `~/.openclaw/openclaw.json`
- Sets Kimi K2.5 as default with DeepSeek + GLM fallbacks

**Step 3 (fresh install only):** Start the gateway:

```bash
openclaw gateway start
```

## Available Models

Switch models anytime in chat with `/model pollinations/<name>`:

| Model | ID | Best for |
|---|---|---|
| **Kimi K2.5** (default) | `pollinations/kimi` | Agentic tasks, vision, reasoning (256K context) |
| **DeepSeek V3.2** | `pollinations/deepseek` | Strong reasoning & tool calling |
| **GLM-4.7** | `pollinations/glm` | Coding, reasoning, agentic workflows |
| **Gemini + Search** | `pollinations/gemini-search` | Web search grounded answers |
| **Claude Haiku 4.5** | `pollinations/claude-fast` | Fast with good reasoning |
| **Claude Opus 4.6** | `pollinations/claude-large` | Most intelligent (paid) |
| **Gemini 3 Pro** | `pollinations/gemini-large` | 1M context (paid) |

## Manual Setup

If you prefer not to run the script, edit `~/.openclaw/openclaw.json` directly. Add a `pollinations` provider under `models.providers`:

```json
{
  "models": {
    "providers": {
      "pollinations": {
        "baseUrl": "https://gen.pollinations.ai/v1",
        "apiKey": "YOUR_API_KEY",
        "api": "openai-completions",
        "models": [
          {
            "id": "kimi",
            "name": "Kimi K2.5",
            "reasoning": true,
            "input": ["text", "image"],
            "contextWindow": 256000,
            "maxTokens": 8192
          }
        ]
      }
    }
  }
}
```

Then set the default model:

```bash
openclaw models set pollinations/kimi
openclaw models fallbacks add pollinations/deepseek
openclaw gateway restart
```

See all available models at [gen.pollinations.ai/v1/models](https://gen.pollinations.ai/v1/models).

## Pollinations Skill (Image/Video/Audio)

The [Pollinations skill on ClawHub](https://github.com/openclaw/skills/blob/main/skills/isaacgounton/pollinations/SKILL.md) gives your agent image, video, and audio generation:

```
/skill install isaacgounton/pollinations
```

## Links

- **API Docs:** https://gen.pollinations.ai/api/docs
- **Get API Key:** https://enter.pollinations.ai
- **Models:** https://gen.pollinations.ai/v1/models
- **GitHub:** https://github.com/pollinations/pollinations
