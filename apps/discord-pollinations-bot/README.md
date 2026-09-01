# Pollinations Discord Bot (BYOP)

A Discord bot that brings a Pollinations Community Agent to Discord with Bring Your Own Pollen (BYOP) support. Each user authorizes their own Pollinations account via device flow — the bot never stores or sees API keys.

## Features

- **BYOP Device Authorization** — users connect via browser, no API keys pasted into Discord
- **Community Agent** — uses a configurable Pollinations Community Agent as the AI backend
- **Slash Commands** — `/connect`, `/disconnect`, `/ask`, `/status`
- **Plain Message Support** — `!ask <question>` for quick access
- **Per-User History** — each user gets their own conversation context
- **Clear Auth Recovery** — expired tokens show reconnect prompts

## Setup

### 1. Create a Discord Bot

1. Go to https://discord.com/developers/applications
2. Create a new application
3. Go to **Bot** → create a bot token
4. Go to **OAuth2** → URL Generator
5. Select scopes: `bot`, `applications.commands`
6. Select permissions: Send Messages, Use Slash Commands, Read Message History
7. Copy the generated URL and invite the bot to your server

### 2. Create a Pollinations App Key

1. Go to https://enter.pollinations.ai/keys
2. Create a new publishable key (`pk_...`)
3. Copy the key

### 3. Configure and Run

```bash
cd apps/discord-pollinations-bot
cp .env.example .env
# Edit .env with your credentials
npm install
npm start
```

## Commands

| Command | Description |
|---------|-------------|
| `/connect` | Connect your Pollinations account via device flow |
| `/disconnect` | Disconnect your account |
| `/ask <question>` | Ask the community agent a question |
| `/status` | Check your connection status |
| `!ask <question>` | Quick ask via plain message |

## Architecture

- Each Discord user authenticates independently via OAuth device flow
- Tokens stored locally at `~/.config/pollinations-discord-bot/users.json`
- Bot uses the user's token for API calls (their Pollen is spent)
- Community Agent model is configurable via `AGENT_MODEL` env var
- No server-side state beyond the user token store

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_BOT_TOKEN` | Discord bot token | Yes |
| `DISCORD_CLIENT_ID` | Discord application client ID | Yes |
| `POLLINATIONS_APP_KEY` | Pollinations app key (`pk_...`) | Yes |
| `AGENT_MODEL` | Community Agent model ID | No (default: `pollinations/research-assistant`) |

## License

MIT
