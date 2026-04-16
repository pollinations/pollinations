# @pollinations_ai/cli

The Pollinations CLI — for humans, AI agents, and everything in between.

A thin, scriptable wrapper around the [Pollinations API](https://gen.pollinations.ai). Generate text, images, audio, and video from the terminal or from an agent loop.

```bash
npx @pollinations_ai/cli auth login
npx @pollinations_ai/cli gen image "a cat in space" --output cat.png
```

## Install

```bash
npm install -g @pollinations_ai/cli
```

Or run without installing:

```bash
npx @pollinations_ai/cli <command>
```

The binary is called `polli`.

## Auth

```bash
polli auth login           # device-flow login via enter.pollinations.ai
polli auth status          # show tier, balance, auth state
polli auth logout          # clear credentials
```

Credentials are stored at `~/.pollinations/credentials.json`. For one-off runs you can pass a key inline with `--key <sk_...>` or the `POLLINATIONS_API_KEY` env var.

Get an API key at [enter.pollinations.ai](https://enter.pollinations.ai).

## Generation

```bash
polli gen text "Explain quantum tunneling in one sentence"
polli gen text "Summarize this" < notes.md
echo "context" | polli gen text "question"

polli gen image "cyberpunk city at night" --model flux --output city.png
polli gen image "enhance this" --image https://media.pollinations.ai/abc123 --model gptimage

polli gen audio "Hello world" --voice nova --output speech.mp3
polli gen video "a waterfall in slow motion" --duration 5 --output clip.mp4
polli gen transcribe speech.mp3

polli gen chat --model openai    # interactive multi-turn
```

`gen text` streams by default. Pipe stdin in and it becomes context for the prompt. All file-output commands save to a default path if `--output` is omitted.

## Discovery

```bash
polli models                     # all models
polli models --type image        # filter by type
polli models --stats             # health + perf (60m window)
polli docs                       # API docs in terminal
polli docs /image                # docs for a specific endpoint
polli docs --open                # open docs in browser
```

## Keys and Usage

```bash
polli keys list                          # list API keys
polli keys create --name mybot --budget 100   # scoped key for an app
polli keys revoke <id>

polli usage                              # current pollen balance
polli usage --history --limit 20         # recent request log
polli usage --daily                      # daily cost summary
```

## For AI Agents

Driving this CLI from an AI coding agent (Claude Code, Cursor, Windsurf, etc.)? Point your agent at the skill file and it will have the full usage map:

> Read https://raw.githubusercontent.com/pollinations/pollinations/main/packages/polli-cli/SKILL.md and follow the instructions to generate media with the `polli` CLI.

The skill ships inside the npm package. With a local install (`npm install @pollinations_ai/cli`) you'll find it at `node_modules/@pollinations_ai/cli/SKILL.md`.

Every command is designed to be agent-friendly:

- **`--json`** — structured output to stdout, human messages to stderr. Safe to parse.
- **Deterministic exit codes** — `0` on success, non-zero on error.
- **Prominent 402 hints** — when a generation runs out of pollen, the CLI prints the top-up link (`https://enter.pollinations.ai`) as the first line of the error, followed by the account balance and the offending key's remaining budget.
- **No hidden state** — `polli auth status --json` returns everything an agent needs to know.

A minimal agent loop:

```bash
KEY=$(polli auth status --json | jq -r .key)
polli gen image "$PROMPT" --model flux --json --output out.png \
  || { echo "Generation failed, check polli usage"; exit 1; }
```

## Global Flags

| Flag            | Meaning                                          |
| --------------- | ------------------------------------------------ |
| `--json`        | JSON output (structured stdout, stderr messages) |
| `--key <key>`   | Override the stored API key for this call       |
| `-h, --help`    | Show help for any command                       |

## API Mapping

| CLI | API |
| --- | --- |
| `gen text` | `POST /v1/chat/completions` |
| `gen image` | `GET /image/:prompt` |
| `gen audio` | `GET /audio/:text` |
| `gen video` | `GET /video/:prompt` |
| `gen transcribe` | `POST /v1/audio/transcriptions` |
| `models` | `GET /{text,image,audio}/models` |
| `usage` | `GET /api/account/{balance,usage,usage/daily}` |
| `docs` | `GET /api/docs/llm.txt` |

## Links

- **Pollinations API**: https://gen.pollinations.ai
- **Dashboard / API keys**: https://enter.pollinations.ai
- **API docs**: https://gen.pollinations.ai/api/docs
- **Source**: https://github.com/pollinations/pollinations/tree/main/packages/polli-cli
- **Discord**: https://discord.gg/pollinations-ai-885844321461485618

## License

MIT
