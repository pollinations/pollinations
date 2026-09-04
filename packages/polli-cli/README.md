# @pollinations/cli

The Pollinations CLI — for humans, AI agents, and everything in between.

Generate text, images, audio, video from the terminal. Backed by the [Pollinations API](https://gen.pollinations.ai).

<video src="https://github.com/user-attachments/assets/c3ff5c45-672c-4c45-9027-7743d32f9785" controls muted loop playsinline width="720">
  <a href="https://github.com/user-attachments/assets/c3ff5c45-672c-4c45-9027-7743d32f9785">▶️ Watch the demo</a>
</video>

```bash
npx @pollinations/cli gen image "a cat in space" --output cat.png
```

## For AI agents

Point your coding agent (Claude Code, Cursor, Windsurf, Codex) at the skill file and it gets the full usage map — flags, stdin conventions, `--json` output shape, error codes, the lot:

> Read https://raw.githubusercontent.com/pollinations/pollinations/main/packages/polli-cli/SKILL.md and follow the instructions to generate media with the `polli` CLI.

The skill also ships inside the package: `node_modules/@pollinations/cli/SKILL.md`.

Every command is agent-friendly:

- `--json` — structured stdout, human messages to stderr. Safe to parse.
- Exit code `0` on success, non-zero on error.
- When a call runs out of pollen, the first line of the error is the top-up link.
- `polli auth status --json` exposes everything about the current session.

## Get started

```bash
npm install -g @pollinations/cli     # installs the `polli` binary
polli auth login                         # device-flow via enter.pollinations.ai
printf '%s' "$POLLINATIONS_API_KEY" | polli auth login --with-token
```

Credentials land at `~/.pollinations/credentials.json`. For one-off runs pass `--key sk_...` or set `POLLINATIONS_API_KEY`. Get keys at [enter.pollinations.ai](https://enter.pollinations.ai/keys).

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
polli quests                 # public quest catalog
polli quests --claimed       # already-completed and earned quest status
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
polli earnings               # developer earnings (default 30 days, --days up to 90)
polli quests --claimable     # only rewards ready to claim
polli agents list            # managed prompt agents
polli my-models list         # invite-only community text, image, transcription, and speech models
```

Manage agents with API-shaped JSON config files plus their callable model name
and catalog title:

```bash
polli agents get <id>
polli agents create --config agent.json --name my-agent --title "My Agent"
polli agents update <id> --config agent.json
polli agents delete <id>
```

`agent.json` contains the complete configuration:

```json
{
  "systemPrompt": "You are a concise research assistant.",
  "baseModel": "openai",
  "mcpServers": ["pollinations"]
}
```

Creating an agent also creates its callable model listing. See [Publish an Agent](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md) for visibility, billing, and lifecycle details.

`polli auth login` creates a key with all account permissions Polli needs: `profile`, `usage`, and `keys`. Use `account:usage` for narrow read-only account state like usage and quests. Use `account:keys` to manage keys and, where invite-only My Models access is enabled, my-models. Quest claiming remains in the dashboard.

## Coding harnesses

Point an agentic coding tool at Pollinations. `on` logs in if needed, mints a
key for the harness, backs up its config, and writes the provider; `off`
restores the backup.

```bash
polli harness --help              # supported harnesses
polli harness dsh on              # DeepSeek Harness → Pollinations (default model: deepseek)
polli harness dsh on --model kimi
polli harness dsh on --no-mcp     # skip MCP tool configuration
polli harness opencode on         # enables the Pollinations OpenCode plugin + default model
polli harness openclaw on         # adds the Pollinations provider + Polli skill to OpenClaw
polli harness pi on               # native provider, key, startup model, and Polli skill
polli harness prime on            # native Prime Agent provider support
polli harness <harness> status
polli harness <harness> off
```

The DSH adapter configures the Pollinations provider, hosted Pollinations MCP,
and Polli CLI skill globally under `$DSH_HOME` (default `~/.dsh`). OpenCode uses
its official plugin; OpenClaw uses `openclaw.json`, while Pi and Prime Agent use
their native `models.json` provider support.

See [Coding Harnesses](https://github.com/pollinations/pollinations/blob/main/CODING_HARNESSES.md) for what each profile changes and how to add one.

## Links

- [gen.pollinations.ai](https://gen.pollinations.ai) — API
- [enter.pollinations.ai](https://enter.pollinations.ai) — dashboard, keys, billing
- [API docs](https://gen.pollinations.ai/docs)
- [Source](https://github.com/pollinations/pollinations/tree/main/packages/polli-cli)
- [Discord](https://discord.gg/pollinations-ai-885844321461485618)

## License

MIT
