# Pollinations x OpenClaw

Use **Pollinations AI models** as your OpenClaw brain through a single API.

The maintained setup path is the Polli CLI. It adds a `pollinations` provider
to OpenClaw, mints a dedicated API key, pulls the current compatible model
catalog live (no manual model list to maintain), and installs the Polli skill
so your agent can generate images, audio, and video.

## Setup

**Prerequisite:** install [OpenClaw](https://openclaw.ai/install) and Node.js.

**Step 1:** Install the Polli CLI:

```bash
npm i -g @pollinations/cli
```

**Step 2:** Connect OpenClaw to Pollinations:

```bash
polli harness openclaw on
```

This opens a browser login on first run (or use `--no-browser`), creates a
dedicated key, and writes the provider into `~/.openclaw/openclaw.json`. Choose
a different default model with `--model <id>` (any tool-calling text model from
`polli models`):

```bash
polli harness openclaw on --model deepseek
```

**Step 3:** See that everything is ready:

```bash
polli harness openclaw status
```

## Using it in OpenClaw

- **Switch models** anytime in chat with `/model pollinations/<name>`.
- **Generate media** with the Polli skill (e.g. "generate an image of a
  lighthouse") once the gateway is running.

## Update / remove

```bash
polli harness openclaw status   # is OpenClaw ready to use Pollinations?
polli harness openclaw off      # remove only the Pollinations setup
```

`off` restores the previous config. If you changed anything since `on`, it
removes only the Pollinations provider, the dedicated key, a `pollinations/*`
default model, and the skill — leaving the rest of your OpenClaw configuration
untouched.

## Legacy one-liner

The old `curl ... | bash -s -- KEY` script still works and forwards to the
same CLI:

```bash
curl -fsSL https://raw.githubusercontent.com/pollinations/pollinations/main/apps/openclaw/setup-pollinations.sh | bash -s -- YOUR_API_KEY
```

## Links

- **API Docs:** https://gen.pollinations.ai/docs
- **Get API Key:** https://enter.pollinations.ai/keys
- **Models:** https://gen.pollinations.ai/v1/models
- **GitHub:** https://github.com/pollinations/pollinations
- **Discord:** https://discord.gg/pollinations-ai-885844321461485618
