# @pollinations/cli

The Pollinations CLI — for humans, AI agents, and everything in between.

Generate text, images, audio, video from the terminal. Backed by the [Pollinations API](https://gen.pollinations.ai).

## Features

- 🖼️ **Generate images** with flux, zimage, and more
- 📝 **Generate text** with streaming, vision, and reasoning support
- 🎵 **Generate audio** with TTS, music, and sound effects
- 🎬 **Generate video** with wan-fast and other models
- 📊 **Transcribe audio** to text with multiple STT models
- 🔑 **Manage API keys** with scoped permissions
- 📈 **Check usage and balance** with history and daily breakdown
- 🗂️ **Upload files** to media.pollinations.ai
- 📋 **List and filter models** with health stats
- 🌐 **Multi-lingual** support (English, Spanish, more coming)
- 🛡️ **Secure credential storage** with keytar
- 🧩 **Persistent configuration** via `polli config`
- 📦 **Machine-readable output** (JSON, YAML, CSV)
- 🚀 **Retry and backoff** for transient errors
- 🌀 **Progress spinners** for long-running operations
- 📝 **Activity logging** to `~/.pollinations/logs/`
- 🤖 **MCP server** for AI agent integration

```bash
npx @pollinations/cli gen image "a cat in space" --output cat.png
```

## For AI agents

Point your coding agent (Claude Code, Cursor, Windsurf, Codex) at the skill file and it gets the full usage map — flags, stdin conventions, `--json` output shape, error codes, the lot:

> Read https://raw.githubusercontent.com/pollinations/pollinations/main/packages/polli-cli/SKILL.md and follow the instructions to generate media with the `polli` CLI.

The skill also ships inside the package: `node_modules/@pollinations/cli/SKILL.md`.

Every command is agent-friendly:

- `--json`, `--yaml`, `--csv` — structured stdout, human messages to stderr. Safe to parse.
- Exit code `0` on success, non-zero on error.
- When a call runs out of pollen, the first line of the error is the top-up link.
- `polli auth status --json` exposes everything about the current session.

## Get started

```bash
npm install -g @pollinations/cli     # installs the `polli` binary
polli auth login                         # device-flow via enter.pollinations.ai
printf '%s' "$POLLINATIONS_API_KEY" | polli auth login --with-token
```

Credentials land at `~/.pollinations/credentials.json` and optionally in system keychain. For one-off runs pass `--key sk_...` or set `POLLINATIONS_API_KEY`. Get keys at [enter.pollinations.ai](https://enter.pollinations.ai).

## Generate

```bash
polli gen text "Explain quantum tunneling in one sentence"
polli gen text "Summarize this" < notes.md          # stdin becomes context
echo "context" | polli gen text "question"

polli gen image "cyberpunk city at night" --model flux --output city.png
polli gen image "enhance this" --image https://media.pollinations.ai/abc --model gptimage

polli gen audio "Hello world" --voice nova --output speech.mp3
polli gen audio "read it to me" --play                # plays back after saving (blocks until done)
polli gen audio "read it to me" --play --background   # plays in background
polli gen video "a waterfall in slow motion" --duration 5 --output clip.mp4
polli gen transcribe speech.mp3

polli gen chat --model openai                         # interactive multi-turn
```

`gen text` streams by default. File-output commands pick a sensible default path if `--output` is omitted.

## Discover

```bash
polli models                 # all models
polli models --type image    # filter
polli models --stats         # health + perf (last 60m)
polli models --no-cache      # force refresh cache
polli docs                   # full API reference in the terminal
polli docs /image            # one endpoint
polli docs --open            # open in browser
polli quests                 # public quest catalog
polli quests mine            # your completed and earned quest status
```

## Account

Two kinds of keys:

- **Secret (`sk_`)** — backend use, full access. Default.
- **Publishable (`pk_`)** — safe to ship in frontend code.

```bash
polli keys list
polli keys create --name mybot --budget 100                    # secret (default)
polli keys create --name myapp --type publishable              # API publishable
polli keys create --name myapp --type publishable \            # 3rd-party app key
  --redirect-uri https://myapp.com/callback --earnings
polli keys revoke <id>
```

Keys can't be edited — to change a name, budget, or model list, revoke and recreate. Publishable app keys default developer earnings off; pass `--earnings` to enable them.

```bash
polli usage                  # pollen balance
polli usage --history        # recent requests
polli usage --daily          # daily spend
polli quests mine --completed # completed and earned quests
polli my-models list         # invite-only community text models
```

## Configuration

```bash
polli config set defaults.model.image flux
polli config get defaults.width
polli config list
polli config remove defaults.voice
polli config clear
```

## MCP Server

For AI agents that support Model Context Protocol:

```bash
polli mcp --stdio
polli mcp --port 8080
```

## Links

- [gen.pollinations.ai](https://gen.pollinations.ai) — API
- [enter.pollinations.ai](https://enter.pollinations.ai) — dashboard, keys, billing
- [API docs](https://gen.pollinations.ai/docs)
- [Source](https://github.com/pollinations/pollinations/tree/main/packages/polli-cli)
- [Discord](https://discord.gg/pollinations-ai-885844321461485618)

## License

MIT