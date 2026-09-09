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
node start-all.js      # systemd launcher used in production (same bot list)
```

## deployment (production)

Runs on the `monitoring-agents` EC2 box (ssh alias `community-monitor`,
details in `operations/infrastructure/gpu/GPU_INSTANCES.md`) as three systemd
units from `systemd/`:

| unit | app | entry |
|------|-----|-------|
| `discord-bots.service` | `discord-bot-family` | `node start-all.js` |
| `catgpt-bot.service` | `../catgpt-bot` | `tsx bot.ts` |
| `opposite-prompt-bot.service` | `../opposite-prompt-bot` | `tsx bot.ts` |

Checkout lives at `/home/ubuntu/discord-bots` (sparse clone of `main` with the
three app dirs). Each app has a live-only `.env` (bot tokens,
`TEXT_POLLINATIONS_TOKEN`) that is never committed.

```bash
ssh community-monitor "cd /home/ubuntu/discord-bots && git pull && \
  for d in discord-bot-family catgpt-bot opposite-prompt-bot; do (cd apps/\$d && npm ci); done && \
  sudo systemctl restart discord-bots catgpt-bot opposite-prompt-bot"
ssh community-monitor "sudo journalctl -u discord-bots -f"
```

Unit changes: copy `systemd/*.service` to `/etc/systemd/system/`, then
`sudo systemctl daemon-reload`.

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
