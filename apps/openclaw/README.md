# Pollinations x OpenClaw

Use **25+ AI models** as your OpenClaw brain through a single API, with one setup command: `polli harness openclaw on`.

**Kimi** as default (256K context, vision, tools, reasoning), with DeepSeek, GLM, and Claude fast models as free alternatives. Premium models (Claude Opus, Gemini Pro) available on the paid tier.

## Setup

The one supported path is the Polli CLI harness. It fetches the current tool-calling model catalog, mints a dedicated Pollinations key, and configures OpenClaw for you:

```bash
npm install -g @pollinations/cli    # if polli is not installed
polli harness openclaw on           # configure provider + skill
polli harness openclaw status       # verify
polli harness openclaw off          # remove only Pollinations-owned changes
```

`on`:

- Ensures Polli is logged in (device flow) and creates a dedicated `polli-harness-openclaw` key.
- Adds the Pollinations provider with live models to `~/.openclaw/openclaw.json` (`models.providers.pollinations`), preserving all other config.
- Sets `pollinations/kimi` as the primary model (`agents.defaults.model.primary`).
- Installs the Polli skill (media, usage, quests) under `~/.openclaw/skills/polli/`.
- Prints the install command if OpenClaw is not installed, and tells you to run `openclaw gateway restart` when it is.

Switch models anytime with `/model pollinations/<name>` or `openclaw models set pollinations/<name>`. Pick the default at setup time with `--model <id>`:

```bash
polli harness openclaw on --model deepseek
```

The old `curl | bash` setup script has been replaced by this harness — no competing setup path remains.

## Available Models

The harness fetches models live from `gen.pollinations.ai/v1/models`; the catalog is not hardcoded. Current tool-calling text models include:

| Model | ID | Best for |
|---|---|---|
| **Kimi** (default) | `pollinations/kimi` | Agentic tasks, vision, reasoning (256K context) |
| **DeepSeek** | `pollinations/deepseek` | Fast reasoning & tool calling |
| **GLM** | `pollinations/glm` | Coding, reasoning, agentic workflows |
| **Claude fast** | `pollinations/claude-fast` | Fast with good reasoning |

## Manual Setup

Prefer to edit by hand? Write the following into `~/.openclaw/openclaw.json` (get a key at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys)):

```json
{
  "models": {
    "mode": "merge",
    "providers": {
      "pollinations": {
        "baseUrl": "https://gen.pollinations.ai/v1",
        "apiKey": "YOUR_API_KEY",
        "api": "openai-completions",
        "models": [
          {
            "id": "kimi",
            "name": "Kimi",
            "reasoning": true,
            "input": ["text", "image"],
            "contextWindow": 256000,
            "maxTokens": 8192,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "pollinations/kimi" }
    }
  }
}
```

Then restart the gateway: `openclaw gateway restart`.

## Pollinations Skill

The Polli skill gives your agent image, video, and audio generation instructions. `polli harness openclaw on` installs it at `~/.openclaw/skills/polli/SKILL.md`; you can also install the community version interactively with `/skill install isaacgounton/pollinations`.

## Links

- **API Docs:** https://gen.pollinations.ai/docs
- **Get API Key:** https://enter.pollinations.ai/keys
- **Models:** https://gen.pollinations.ai/v1/models
- **GitHub:** https://github.com/pollinations/pollinations
- **Discord:** https://discord.gg/pollinations-ai-885844321461485618
