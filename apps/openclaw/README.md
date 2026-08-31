# Pollinations x OpenClaw

Use Pollinations' live OpenAI-compatible model catalog as your OpenClaw brain through a single API.

**Kimi** is the default (262K context, vision, tools, reasoning), with DeepSeek, GLM, Gemini, Claude, Qwen, Grok, and community models available through the live catalog. Usage is metered in Pollen and new accounts receive included starter credits.

## Setup

**Step 1:** Get your API key (comes with free credits) at [enter.pollinations.ai](https://enter.pollinations.ai/keys)

**Step 2:** Run the setup script (requires `jq`):

```bash
curl -fsSL https://raw.githubusercontent.com/pollinations/pollinations/main/apps/openclaw/setup-pollinations.sh | bash -s -- YOUR_API_KEY
```

This works for both fresh installs and existing OpenClaw setups. It:
- Runs `openclaw onboard` for fresh installs (creates config + workspace)
- Adds a curated Pollinations provider model set to `~/.openclaw/openclaw.json`
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
| **Kimi Code** | `pollinations/kimi-code` | Agentic coding, vision, reasoning (262K context) |
| **DeepSeek** | `pollinations/deepseek` | Fast reasoning & tool calling |
| **DeepSeek Pro** | `pollinations/deepseek-pro` | Advanced reasoning & coding |
| **GLM** | `pollinations/glm` | Coding, reasoning, agentic workflows |
| **Gemini Fast** | `pollinations/gemini-fast` | Fast multimodal model with web search |
| **Claude Fast** | `pollinations/claude-fast` | Fast multimodal Claude |
| **Claude Opus 4.6** | `pollinations/claude-opus-4.6` | Deep reasoning and tool calling |
| **Gemini Large** | `pollinations/gemini-large` | 1M context, reasoning, web search |

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
          },
          {
            "id": "kimi-code",
            "name": "Kimi Code",
            "reasoning": true,
            "input": ["text", "image"],
            "contextWindow": 262144,
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
openclaw models fallbacks add pollinations/glm
openclaw gateway restart
```

See all available models, including community models and current Pollen pricing, at [gen.pollinations.ai/v1/models](https://gen.pollinations.ai/v1/models).

## Pollinations Skill (Image/Video/Audio)

The [Pollinations skill](https://github.com/pollinations/pollinations/tree/main/apps/openclaw) gives your agent image, video, and audio generation:

```
/skill install isaacgounton/pollinations
```

## Links

- **API Docs:** https://gen.pollinations.ai/docs
- **Get API Key:** https://enter.pollinations.ai/keys
- **Models:** https://gen.pollinations.ai/v1/models
- **GitHub:** https://github.com/pollinations/pollinations
- **Discord:** https://discord.gg/pollinations-ai-885844321461485618
