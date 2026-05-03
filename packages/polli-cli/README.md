# @pollinations_ai/cli

The Pollinations CLI — for humans, AI agents, and everything in between.

Generate text, images, audio, video from the terminal. Backed by the [Pollinations API](https://gen.pollinations.ai).

https://github.com/user-attachments/assets/6b200d95-d734-469c-9fe5-3e63549778fe

```bash
npx @pollinations_ai/cli gen image "a cat in space" --output cat.png
```

## For AI agents

Point your coding agent (Claude Code, Cursor, Windsurf, Codex) at the skill file and it gets the full usage map — flags, stdin conventions, `--json` output shape, error codes, the lot:

> Read https://raw.githubusercontent.com/pollinations/pollinations/main/packages/polli-cli/SKILL.md and follow the instructions to generate media with the `polli` CLI.

The skill also ships inside the package: `node_modules/@pollinations_ai/cli/SKILL.md`.

Every command is agent-friendly:

- `--json` — structured stdout, human messages to stderr. Safe to parse.
- Exit code `0` on success, non-zero on error.
- When a call runs out of pollen, the first line of the error is the top-up link.
- `polli auth status --json` exposes everything about the current session.

## Get started

```bash
npm install -g @pollinations_ai/cli     # installs the `polli` binary
polli auth login                         # device-flow via enter.pollinations.ai
printf '%s' "$POLLINATIONS_API_KEY" | polli auth login --with-token
```

Credentials land at `~/.pollinations/credentials.json`. For one-off runs pass `--key sk_...` or set `POLLINATIONS_API_KEY`. Get keys at [enter.pollinations.ai](https://enter.pollinations.ai).

## Generate

```bash
polli gen text "Explain quantum tunneling in one sentence"
polli gen text "Summarize this" < notes.md          # stdin becomes context
echo "context" | polli gen text "question"

polli gen image "cyberpunk city at night" --model flux --output city.png
polli gen image "enhance this" --image https://media.pollinations.ai/abc --model gptimage

polli gen audio "Hello world" --voice nova --output speech.mp3
polli gen audio "read it to me" --play                # plays back after saving (blocks until done)
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
polli docs                   # full API reference in the terminal
polli docs /image            # one endpoint
polli docs --open            # open in browser
```

## Account

```bash
polli keys list
polli keys create --name mybot --budget 100
polli keys create --name myapp --type publishable --redirect-uri https://myapp.com/callback
polli keys revoke <id>

polli usage                  # pollen balance
polli usage --history        # recent requests
polli usage --daily          # daily spend
```

## Bees

Deploy agent backends with a `bee.json` manifest:

```bash
polli bees init bee.json --name booking-assistant
polli bees init bee.json --name booking-assistant --template queen
polli bees validate bee.json
polli bees deploy bee.json --dry-run       # preview runtime, URLs, scopes, meters
polli bees deploy bee.json                 # calls POST /api/bees
polli bees deploy bee.json --upgrade       # calls POST /api/bees?upgrade=1
polli bees list
polli bees status bee_booking-assistant
polli bees events bee_booking-assistant
polli bees delete bee_booking-assistant --yes
```

The default manifest omits runtime details. Missing `runtime` resolves to
`worker + auto`; missing `state.backend` resolves to `sqlite`.
`init` creates a Worker Bee by default; `--template queen` creates the
full-runtime Queen Bee starter.
Repeated deploys of the same generated bee id fail unless `--upgrade` is used.

## Links

- [gen.pollinations.ai](https://gen.pollinations.ai) — API
- [enter.pollinations.ai](https://enter.pollinations.ai) — dashboard, keys, billing
- [API docs](https://gen.pollinations.ai/docs)
- [Source](https://github.com/pollinations/pollinations/tree/main/packages/polli-cli)
- [Discord](https://discord.gg/pollinations-ai-885844321461485618)

## License

MIT
