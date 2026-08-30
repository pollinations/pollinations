# Pollinations x OpenClaw

Use Pollinations' current text models as your OpenClaw brain through a single API, with a dedicated key, a Polli skill, and no manually maintained model list to fall out of date.

## Setup

```bash
npx @pollinations/cli harness openclaw on
```

This works for both fresh installs and existing OpenClaw setups:

- If `openclaw` is not installed, it stops and prints the official installer instead of guessing at one — install it, then re-run the command.
- If OpenClaw has never been onboarded, it runs OpenClaw's own non-interactive onboarding first (workspace, gateway token, agent), the same way `openclaw onboard` normally would.
- It logs in to Pollinations (browser device flow by default) and mints a Pollinations API key dedicated to this OpenClaw install — separate from any other key on your account.
- It adds a `pollinations` provider to `models.providers` in `openclaw.json`, populated from the **current** Pollinations text-model catalog (`gen.pollinations.ai/v1/models`), and sets it as the default model.
- It installs the [Polli skill](https://github.com/pollinations/pollinations/tree/main/packages/polli-cli) so the agent can also generate images, audio, and video, and use the rest of the `polli` CLI.
- Every other agent, channel, and config value already in `openclaw.json` is left untouched.

Check anytime with:

```bash
polli harness openclaw status
```

Restart a running gateway to pick up the change immediately:

```bash
openclaw gateway restart
```

### Choosing a model

```bash
npx @pollinations/cli harness openclaw on --model deepseek
```

`kimi` is the default. Run `polli models` to see the current list of tool-calling text models — this comes straight from the API, so it is always current; there is nothing to look up in this README.

Switch models later without re-running setup:

```bash
openclaw models set pollinations/<model-id>
```

### Removing the integration

```bash
polli harness openclaw off
```

Restores `openclaw.json` to what it was before `on` ran (or, if something else edited it since, strips only the `pollinations` provider, the `pollinations/*` default model, and the Polli skill).

## Manual setup

If you prefer not to run the CLI, add a `pollinations` provider under `models.providers` in `~/.openclaw/openclaw.json` yourself:

```json
{
  "env": {
    "vars": { "POLLI_OPENCLAW_API_KEY": "YOUR_API_KEY" }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "pollinations": {
        "baseUrl": "https://gen.pollinations.ai/v1",
        "apiKey": "${POLLI_OPENCLAW_API_KEY}",
        "api": "openai-completions",
        "models": [
          { "id": "kimi", "name": "kimi", "input": ["text", "image"], "contextWindow": 256000 }
        ]
      }
    }
  },
  "agents": {
    "defaults": { "model": { "primary": "pollinations/kimi" } }
  }
}
```

See the current model list at [gen.pollinations.ai/v1/models](https://gen.pollinations.ai/v1/models), then:

```bash
openclaw gateway restart
```

## Links

- **API Docs:** https://gen.pollinations.ai/docs
- **Get API Key:** https://enter.pollinations.ai/keys
- **Models:** https://gen.pollinations.ai/v1/models
- **Coding Harnesses guide:** https://github.com/pollinations/pollinations/blob/main/CODING_HARNESSES.md
- **GitHub:** https://github.com/pollinations/pollinations
- **Discord:** https://discord.gg/pollinations-ai-885844321461485618
