# discord bot family

runs multiple AI-powered discord bots, each using a different model via the pollinations api. bots chat in channels, respond to mentions/DMs, and occasionally invite people to add them to their servers.

## setup

```bash
npm install
npm run decrypt-vars   # sops-decrypt secrets/env.json -> .env
```

Update secrets (decrypts in your editor, re-encrypts on save):
```bash
sops secrets/env.json
```

## config

- `secrets/env.json` — sops-encrypted api keys + bot tokens (committed)
- `.env` — decrypted secrets, produced by `npm run decrypt-vars` (gitignored)
- `bots.json` — models, shared/per-bot channels (safe to commit)

each bot gets the shared channels plus any bot-specific ones.

## run

```bash
./start-all.sh         # local/launchd: spawns one process per bot
node start-all.js      # launcher for the legacy Family systemd unit
```

## deployment (production)

CatGPT and Opposite Prompt run on the production Pollinations Azure sandbox
`discord-bots-azure` (2 vCPU, 2 GiB). Keep the sandbox in Fixed mode and renew
the lease before it expires so the Discord Gateway connections stay up.

| App | Discord token variable | Text model | Image model |
| --- | --- | --- | --- |
| [CatGPT](../catgpt-bot/) | `BOT_TOKEN_CATGPT` | GPT-6.1 Terra | GPT Image 2.5 Sunburst, medium |
| [Opposite Prompt](../opposite-prompt-bot/) | `BOT_TOKEN_OPPOSITE_PROMPT` | GPT-6 Luna | GPT Image 2.5 Sunburst, medium |

To set up either app, copy its `bot.ts`, `package.json`, and the shared
[`run-bot.sh`](azure/run-bot.sh) into a private directory on the sandbox
(mode `700`). Install dependencies with `npm install --omit=dev --ignore-scripts`
on a fresh directory. Use `npm ci --omit=dev --ignore-scripts` for subsequent
installs with that directory's lockfile. The app's `.env` (mode `600`) supplies
its Discord token and `TEXT_POLLINATIONS_TOKEN`. CatGPT also accepts
`CATGPT_CHANNEL_ID`.

Add a user crontab entry for each app directory using its absolute path.

```cron
* * * * * /bin/sh /home/user/discord-bots/catgpt-bot/run-bot.sh >/dev/null 2>&1
* * * * * /bin/sh /home/user/discord-bots/opposite-prompt-bot/run-bot.sh >/dev/null 2>&1
```

Create `.enabled` in the app directory and check `bot.log` for Discord Ready.
The launcher holds a per-app lock and stores its PID in `.bot.pid`. To stop an
app, remove `.enabled` first, then terminate the PID after verifying it belongs
to that app. For an EC2 rollback, confirm the Azure process has stopped before
re-enabling the matching unit from [`systemd/`](systemd/).

The three legacy EC2 units are stopped and disabled. Discord Bot Family is a
separate app. Its MiniMax source and dependencies were staged on Azure with
manual start only. Its Discord login still needs a live test.

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
