# Polly Helper Bot 🌸

A Discord bot that creates well-formatted GitHub issues when @mentioned. Uses AI to enhance issue descriptions and GitHub Actions to create issues.

## How It Works

1. **@mention the bot** with an issue description
2. Bot uses AI to parse and enhance the description
3. Triggers GitHub Actions workflow to create the issue
4. Shows confirmation in Discord

### Example

```
User: @PollyHelper pollen balance seems to be frozen, can anyone help?

Bot: ✅ Issue Submitted
     **Pollen Balance Display Issue**
     Status: Issue is being created via GitHub Actions
     Reporter: Username#1234
```

### Reporting Someone Else's Issue

Reply to another user's message and @mention the bot:

```
OtherUser: My pollen balance is broken!

You (replying): @PollyHelper

Bot: ✅ Issue Submitted
     Status: Issue is being created via GitHub Actions
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

### 3. Setup GitHub Actions

Copy the `.github/workflows/create-issue.yml` to your repository's `.github/workflows/` folder.

### 4. Configure Environment

```bash
cp .env.example .env
```

```env
DISCORD_TOKEN=your_discord_bot_token
GITHUB_TOKEN=your_github_token  # for triggering workflows
GITHUB_REPO=pollinations/pollinations
POLLINATIONS_API_KEY=your_api_key  # from https://enter.pollinations.ai
```

### 5. Run

```bash
pip install -r requirements.txt
python bot.py
```

## Architecture

```
Discord User → @mentions bot → AI enhances description → 
  Bot triggers repository_dispatch → GitHub Actions creates issue
```

The bot uses `repository_dispatch` to trigger a GitHub Actions workflow, which creates issues using the built-in `GITHUB_TOKEN`. This means:
- No personal GitHub account needed for issue creation
- Issues are created by "github-actions[bot]"
- More secure - no personal tokens stored

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `GITHUB_TOKEN` | Yes | Token to trigger GitHub Actions (PAT or App token) |
| `GITHUB_REPO` | No | Target repo (default: `pollinations/pollinations`) |
| `POLLINATIONS_API_KEY` | Yes | API key from enter.pollinations.ai |

## License

MIT License