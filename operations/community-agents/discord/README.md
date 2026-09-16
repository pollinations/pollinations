# Hosted Discord Community Agents

One reusable Pollinations runner for creator-owned Discord bots. Each deployment connects one Discord bot identity to one public Pollinations Community Agent; it does not require an app-catalog entry or copy the agent's behavior.

## Creator setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. On **Installation**, enable **Guild Install** with `applications.commands`, `bot`, **View Channels**, **Send Messages**, and **Read Message History**.
3. Copy the application ID and generate a bot token. Treat the token as a password.
4. Install the bot in a test server.
5. Give Pollinations the application ID and bot token through the agreed private secret channel—not an issue, pull request, or chat message.

The creator continues to own the Discord application and controls its name, avatar, installation, and token rotation. Pollinations only hosts the shared runner.

## Deployment

Install once for each bot deployment:

```bash
cd operations/community-agents/discord
npm ci
cp .env.example .env
```

Configure:

```text
DISCORD_TOKEN=<creator-owned bot token>
DISCORD_CLIENT_ID=<Discord application ID>
POLLINATIONS_APP_KEY=<publishable pk_ app key>
COMMUNITY_AGENT_ID=<owner/agent-name>
COMMUNITY_AGENT_NAME=<optional display name>
DISCORD_GUILD_ID=<optional test guild>
```

Register commands and run:

```bash
npm run register
npm start
```

Run another Community Agent as another Discord bot by deploying the same code with different configuration. Bot tokens stay in the host's secret store and never belong in this repository.

## User flow

- `/connect` authorizes a private, model-limited Pollinations BYOP key with a 5-Pollen budget and seven-day expiry.
- `/ask` calls the configured Community Agent.
- `/status` shows the connection and agent.
- `/disconnect` deletes the user's delegated key.

The runner requests only the Discord `Guilds` intent. It reconstructs up to five turns from that bot's own Discord messages, so it needs no conversation database and does not read unrelated conversation text.

User authorizations are private to each Discord user and stored by Discord application ID under `./data/` (or at `TOKEN_STORE_PATH`) with file mode `0600`. Invalid authorizations are removed automatically.
