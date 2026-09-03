# Discord Agent: OSAII Swarm

A focused Discord adapter for the existing public Pollinations Community Agent `morriszdweck/osaii-swarm`.

The Community Agent remains the source of behavior. This app adds only Discord interactions, BYOP device authorization, private per-user credential storage, and bounded conversation context reconstructed from prior Discord responses.

## Why this agent

`morriszdweck/osaii-swarm` is a public text Community Agent backed by `morriszdweck/osaii-api-smart`. During the quest demo it was verified with both an owner key and a BYOP-issued user key.

## Commands

- `/connect` — private Pollinations device authorization; no API key is pasted into Discord.
- `/ask prompt:<...>` — calls `morriszdweck/osaii-swarm` with the connected user's authorization.
- `/status` — verifies the authorization and shows the selected agent.
- `/disconnect` — removes only that Discord user's stored authorization.

## Least-privilege consent

Pollinations' SDK device helper currently transports `client_id` and OAuth account `scope`, while model permissions are selected on the consent page. This adapter keeps the SDK's device-code issuance and polling, but sends the user directly to the same Pollinations `/authorize` page with safe defaults:

- allowed models: `morriszdweck/osaii-swarm` and its base model `morriszdweck/osaii-api-smart`;
- Pollen budget: `5`;
- expiry: `7` days;
- no `profile`, `usage`, or `keys` account permission requested.

The user still sees Pollinations' consent UI and can review, change, or deny the grant.

## Setup

Requires Node.js 18+ and a Discord application/bot.

```bash
cd apps/discord-agent-osaii-swarm
npm ci
cp .env.example .env
```

Set:

```text
DISCORD_TOKEN=<Discord bot token>
DISCORD_CLIENT_ID=<Discord application id>
POLLINATIONS_APP_KEY=pk_...
DISCORD_GUILD_ID=<optional test guild id>
```

`POLLINATIONS_APP_KEY` is the publishable App Key (`pk_...`) used as the BYOP `client_id`. It identifies the app; it does not spend the developer's Pollen. Each Discord user authorizes their own scoped `sk_...` key.

Register slash commands and start:

```bash
npm run register
npm start
```

With `DISCORD_GUILD_ID`, commands are registered only to that test guild and propagate immediately. Omit it for global registration.

The bot only needs Discord's `Guilds` gateway intent. It does not request Message Content: short context is reconstructed from this bot's own response embeds, filtered by Discord user ID.

## Credential handling

User authorizations are stored at `./data/tokens.json` by default (override with `TOKEN_STORE_PATH`). The directory is private, writes are serialized and atomic, the file mode is `0600`, and tokens are never included in Discord messages or logs.

If Pollinations reports an expired or revoked authorization, the local token is removed and the user is asked to `/connect` again.

## Reproducible connect → use → disconnect

1. Start the bot and run `/connect`.
2. Review the Pollinations consent page: OSAII Swarm + its base model, 5-Pollen budget, seven-day expiry.
3. Approve; the Discord response confirms connection without exposing the token.
4. Run `/status`.
5. Run `/ask prompt:"Give me one practical idea for this Discord discussion"`.
6. Run a second `/ask`; bounded prior bot responses for that same Discord user are reused as context.
7. Run `/disconnect`, then `/ask`; reconnect is required.

Run local tests with:

```bash
npm test
```

No dashboard, copied system prompt, replacement agent implementation, or server-side conversation database is included.
