# Pollinations x OpenClaw

Use **25+ AI models** as your OpenClaw brain through a single API.

**Kimi K2.5** as default (256K context, vision, tools, reasoning), with DeepSeek, GLM 5, and Claude Haiku as free alternatives. Premium models (Claude Opus, Gemini Pro) available on paid tier.

## Setup

Install the [Polli CLI](https://www.npmjs.com/package/@pollinations/cli) and run:

```bash
npm install -g @pollinations/cli
polli harness openclaw on
```

`polli harness openclaw on` will:
- Log in and create a dedicated Pollinations API key for OpenClaw
- Write the Pollinations provider with current models to `~/.openclaw/openclaw.json`
- Set `kimi` as the default model
- Install the Polli skill so your agent can generate images, audio, and video

Pick a different default model with `--model`:

```bash
polli harness openclaw on --model deepseek
```

Run `openclaw gateway restart` after setup for the new provider to take effect.

## Status and removal

```bash
polli harness openclaw status   # show whether the integration is ready
polli harness openclaw off      # remove only Pollinations-owned changes
```

## Available models

Switch models anytime in chat with `/model pollinations/<name>`. Current models are fetched live from `gen.pollinations.ai/v1/models` during setup. Common choices:

| Model | ID | Notes |
|---|---|---|
| Kimi K2.5 (default) | `pollinations/kimi` | 256K context, vision, reasoning |
| DeepSeek V4 Flash | `pollinations/deepseek` | Fast reasoning & tool calling |
| GLM 5 | `pollinations/glm` | Coding, agentic workflows |
| Claude Haiku 4.5 | `pollinations/claude-fast` | Fast, good reasoning |

See the full live list: [gen.pollinations.ai/v1/models](https://gen.pollinations.ai/v1/models)

## Pollinations Skill (Image/Video/Audio)

`polli harness openclaw on` installs the Polli skill automatically. To install it separately:

```
/skill install isaacgounton/pollinations
```

## Links

- **API Docs:** https://gen.pollinations.ai/docs
- **Get API Key:** https://enter.pollinations.ai/keys
- **Models:** https://gen.pollinations.ai/v1/models
- **GitHub:** https://github.com/pollinations/pollinations
- **Discord:** https://discord.gg/pollinations-ai-885844321461485618
