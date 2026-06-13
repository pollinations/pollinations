# Pollinations x Hermes Agent

Use **25+ AI models** as your Hermes Agent brain through a single API.

**Kimi K2.5** as default (256K context, vision, tools, reasoning), with DeepSeek, GLM-4.7, and Claude Haiku as free alternatives. Premium models (Claude Opus, Gemini 3 Pro) available on paid tier.

## Setup

**Step 1:** Get your API key (comes with free credits) at [enter.pollinations.ai](https://enter.pollinations.ai)

**Step 2:** Run the setup script:

```bash
curl -fsSL https://raw.githubusercontent.com/pollinations/pollinations/main/apps/hermes/setup-pollinations.sh | bash -s -- YOUR_API_KEY
```

This works for both fresh installs and existing Hermes setups. It:
- Runs `hermes init` for fresh installs (creates config + workspace)
- Adds the Pollinations provider with 7 models to `~/.hermes/config.yaml`
- Sets Kimi K2.5 as default with DeepSeek + GLM fallbacks

**Step 3 (fresh install only):** Start Hermes:

```bash
hermes start
```

## Available Models

Switch models anytime with `/model pollinations:kimi`:

| Model | ID | Best for |
|---|---|---|
| **Kimi K2.5** (default) | `pollinations:kimi` | Agentic tasks, vision, reasoning (256K context) |
| **DeepSeek V3.2** | `pollinations:deepseek` | Strong reasoning & tool calling |
| **GLM-4.7** | `pollinations:glm` | Coding, reasoning, agentic workflows |
| **Gemini + Search** | `pollinations:gemini-search` | Web search grounded answers |
| **Claude Haiku 4.5** | `pollinations:claude-fast` | Fast with good reasoning |
| **Claude Opus 4.6** | `pollinations:claude-large` | Most intelligent (paid) |
| **Gemini 3 Pro** | `pollinations:gemini-large` | 1M context (paid) |

## MCP Integration

Hermes supports MCP natively. The setup script auto-configures the Pollinations MCP server for image, audio, and video generation. To add it manually:

```bash
hermes mcp add pollinations -- npx -y @pollinations_ai/model-context-protocol
```

## Manual Setup

Edit `~/.hermes/config.yaml` directly:

```yaml
model:
  provider: custom
  default: kimi
  base_url: https://gen.pollinations.ai/v1
  api_key: YOUR_API_KEY
  context_length: 256000

custom_providers:
  - name: pollinations
    base_url: https://gen.pollinations.ai/v1
    api_key: YOUR_API_KEY
    api_mode: chat_completions
    models:
      kimi:
        context_length: 256000
      deepseek:
        context_length: 128000
      glm:
        context_length: 128000
      gemini-search:
        context_length: 128000
      claude-fast:
        context_length: 200000
      claude-large:
        context_length: 200000
      gemini-large:
        context_length: 1000000

fallback_model:
  provider: custom
  model: deepseek
  base_url: https://gen.pollinations.ai/v1
  api_key: YOUR_API_KEY

mcp_servers:
  pollinations:
    command: "npx"
    args: ["-y", "@pollinations_ai/model-context-protocol"]
```

Then: `hermes model custom:pollinations:kimi`

## Links

- **API Docs:** https://gen.pollinations.ai/api/docs
- **Get API Key:** https://enter.pollinations.ai
- **Models:** https://gen.pollinations.ai/v1/models
- **Hermes Agent:** https://github.com/NousResearch/hermes-agent
- **GitHub:** https://github.com/pollinations/pollinations
