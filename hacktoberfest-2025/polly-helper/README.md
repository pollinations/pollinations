# Polly Helper Bot 🌸

A Discord bot that creates well-formatted GitHub issues when @mentioned. Uses AI to enhance issue descriptions.

## How It Works

1. **@mention the bot** with an issue description
2. Bot uses AI to parse and enhance the description
3. Creates a GitHub issue with proper formatting
4. Shows the created issue link

### Example

```
User: @PollyHelper pollen balance seems to be frozen, can anyone help?

Bot: ✅ Issue Created
     **Pollen Balance Display Issue**
     Issue: #1234
     Reporter: Username#1234
```

### Reporting Someone Else's Issue

Reply to another user's message and @mention the bot:

```
OtherUser: My pollen balance is broken!

You (replying): @PollyHelper

Bot: ✅ Issue Created
     Issue: #1234
     Reporter: You#1234
     Original Author: OtherUser#5678
```

## Setup

### 1. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create new application → Bot → Copy token
3. Enable **Message Content Intent** in Bot settings

### 2. Invite the Bot

OAuth2 → URL Generator:
- Scopes: `bot`
- Permissions: Read Messages, Send Messages, Embed Links

### 3. Configure Environment

```bash
cp .env.example .env
```

```env
DISCORD_TOKEN=your_discord_bot_token
GITHUB_TOKEN=your_github_pat  # needs 'repo' scope
GITHUB_REPO=pollinations/pollinations
POLLINATIONS_API_KEY=your_api_key  # from https://enter.pollinations.ai
```

### 4. Run

```bash
pip install -r requirements.txt
python bot.py
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `GITHUB_TOKEN` | Yes | GitHub PAT with `repo` scope |
| `GITHUB_REPO` | No | Target repo (default: `pollinations/pollinations`) |
| `POLLINATIONS_API_KEY` | Yes | API key from enter.pollinations.ai |

## License

MIT License