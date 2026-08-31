# Pollinations x OpenClaw

Use **Pollinations' live model catalog** as your OpenClaw brain through a single API, set up with the polli CLI's integrated OpenClaw harness.

## Setup

The recommended setup goes through `polli harness`, which is the same single source of truth used for every coding harness (`deepseek`, `openclaw`, ...). It mints a dedicated key, writes the live provider catalog, and installs the Polli skill — no hand-maintained model list.

**Step 1:** Get an API key (comes with free credits) at [enter.pollinations.ai](https://enter.pollinations.ai/keys), or just let polli log you in and mint a harness key for you.

**Step 2:** Install OpenClaw, then run:

```bash
npx @pollinations/cli harness openclaw on
```

Or use the convenience shim (same thing under the hood):

```bash
curl -fsSL https://raw.githubusercontent.com/pollinations/pollinations/main/apps/openclaw/setup-pollinations.sh | bash
```

**Step 3 (fresh install only):** Start the gateway:

```bash
openclaw gateway start
```

### Managing the integration

```bash
polli harness openclaw status          # is OpenClaw ready to use Pollinations?
polli harness openclaw on --model deepseek   # switch the default model
polli harness openclaw off             # remove only the Pollinations-owned config + skill
```

What `on` does:

- Logs Polli in if needed and mints a dedicated `polli-harness-openclaw` API key.
- Adds the Pollinations provider with the **current live catalog** (no hardcoded list) to `~/.openclaw/openclaw.json`, via the `pollinations/*` wildcard.
- Installs the Polli skill under `~/.openclaw/skills/polli`.
- Preserves existing agents, sources, fallbacks, and unrelated config.

`off` restores a byte-for-byte backup taken before `on`, or strips only the Pollinations-owned provider, model, key, and skill.

## Using models

Switch models anytime in chat with `/model pollinations/<id>`. See the live list:

```bash
curl https://gen.pollinations.ai/v1/models
```

## Pollinations Skill (Image/Video/Audio)

The [Polli skill](https://github.com/pollinations/pollinations/tree/main/packages/polli-cli) gives your agent image, video, audio, and speech generation. `polli harness openclaw on` installs it automatically.

## Links

- **API Docs:** https://gen.pollinations.ai/docs
- **Get API Key:** https://enter.pollinations.ai/keys
- **Models:** https://gen.pollinations.ai/v1/models
- **Coding Harnesses:** https://github.com/pollinations/pollinations/blob/main/CODING_HARNESSES.md
- **Discord:** https://discord.gg/pollinations-ai-885844321461485618
