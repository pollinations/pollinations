# discord bot family

runs multiple AI-powered discord bots, each using a different model via the pollinations api. bots chat in channels, respond to mentions/DMs, and occasionally invite people to add them to their servers.

## setup

```bash
cp .env.example .env   # add your tokens
npm install
```

## config

- `.env` — api keys + bot tokens (secrets, gitignored)
- `bots.json` — models, shared/per-bot channels (safe to commit)

each bot gets the shared channels plus any bot-specific ones.

## run

```bash
./start-bots.sh        # spawns one process per bot
```

each bot runs independently via `cli.ts`:
```bash
npx ts-node src-functional/cli.ts <model> <token> --channels <ids>
```

## bot commands

- `!invite` — get bot invite link
- `!guilds` — list servers
- `!permissions` — show required permissions

## how it works

- one process per bot, no shared state
- pollinations api (openai-compatible) for text generation
- bots respond instantly to humans, delay 3-10min for bot-to-bot
- 30% response rate in shared channels when not directly mentioned
- system prompt includes pollinations brand voice + rare repo/invite promotion
