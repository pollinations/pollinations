# Pollinations x OpenClaw

Connect OpenClaw to the live Pollinations model catalog through the Polli CLI.

## Setup

**Step 0:** Install OpenClaw using the [official instructions](https://openclaw.ai/install.sh).

**Step 1:** Log in with the Polli CLI package:

```bash
npx --yes @pollinations/cli auth login
```

**Step 2:** Connect OpenClaw through the Polli CLI:

```bash
npx --yes @pollinations/cli harness openclaw on
```

If the package is already installed, `polli auth login` and
`polli harness openclaw on` are equivalent.

The adapter discovers compatible live tool-calling models, stores a dedicated
key in `env.vars.POLLI_OPENCLAW_API_KEY`, and configures the provider at
`~/.openclaw/openclaw.json`. Use `npx --yes @pollinations/cli harness openclaw status`
to inspect it and `npx --yes @pollinations/cli harness openclaw off` to remove the
Pollinations-owned fields.

For older installations, the setup script remains as a compatibility shim:

```bash
curl -fsSL https://raw.githubusercontent.com/pollinations/pollinations/main/apps/openclaw/setup-pollinations.sh -o setup-pollinations.sh
less setup-pollinations.sh
bash setup-pollinations.sh
```

The shim forwards to the same CLI adapter.

**Step 3:** Restart the gateway if it is already running:

```bash
openclaw gateway start
```

## Models

The adapter reads the live catalog and selects a compatible tool-calling text
model dynamically. See [gen.pollinations.ai/v1/models](https://gen.pollinations.ai/v1/models)
for current model IDs and metadata.

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
