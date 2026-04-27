# Pollinations x OpenClaw

Use **25+ AI models** as your OpenClaw brain through a single API.

**OpenClaw** as default — a preset alias over the existing `qwen3-coder` backbone, tuned with a system prompt for agentic coding and computer-use workflows. Not a new backend model. Kimi K2.5, DeepSeek, GLM 5, and Claude Haiku available as free alternatives. Premium models (Claude Opus, Gemini 3 Pro) on paid tier.

## Setup

**Step 1:** Get your API key (comes with free credits) at [enter.pollinations.ai](https://enter.pollinations.ai)

**Step 2:** Run the setup script (requires `jq`):

```bash
curl -fsSL https://raw.githubusercontent.com/pollinations/pollinations/main/apps/openclaw/setup-pollinations.sh | bash -s -- YOUR_API_KEY
```

This works for both fresh installs and existing OpenClaw setups. It:
- Runs `openclaw onboard` for fresh installs (creates config + workspace)
- Adds the Pollinations provider with 9 models to `~/.openclaw/openclaw.json`
- Sets OpenClaw as default with Kimi + DeepSeek + GLM fallbacks

**Step 3 (fresh install only):** Start the gateway:

```bash
openclaw gateway start
```

## Available Models

Switch models anytime in chat with `/model pollinations/<name>`:

| Model | ID | Best for |
|---|---|---|
| **OpenClaw** (default) | `pollinations/openclaw` | Agentic coding, terminal workflows, computer-use reliability |
| **Kimi K2.6** | `pollinations/kimi` | Agentic tasks, vision, reasoning (256K context) |
| **DeepSeek V4 Flash** | `pollinations/deepseek` | Fast reasoning & tool calling (paid) |
| **DeepSeek V4 Pro** | `pollinations/deepseek-pro` | Advanced reasoning & coding (paid) |
| **GLM 5.1** | `pollinations/glm` | Coding, reasoning, agentic workflows |
| **Gemini + Search** | `pollinations/gemini-search` | Web search grounded answers |
| **Claude Haiku 4.5** | `pollinations/claude-fast` | Fast with good reasoning |
| **Claude Opus 4.6** | `pollinations/claude-large` | Most intelligent (paid) |
| **Gemini 3.1 Pro** | `pollinations/gemini-large` | 1M context (paid) |

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
            "id": "openclaw",
            "name": "OpenClaw",
            "input": ["text"],
            "contextWindow": 262144,
            "maxTokens": 8192
          },
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
openclaw models set pollinations/openclaw
openclaw models fallbacks add pollinations/kimi
openclaw models fallbacks add pollinations/deepseek
openclaw models fallbacks add pollinations/glm
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
