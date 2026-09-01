# discord-byop-bot

A Discord bot that demonstrates **Bring Your Own Pollen** (BYOP) device authorization. Users connect their Pollinations wallet directly from Discord — no API key pasting required.

## How it works

1. User runs `/connect` in Discord.
2. Bot starts a device authorization flow and DMs the user a short code + verification URL.
3. User opens the URL in their browser, signs in with GitHub, and approves the bot.
4. Bot receives a scoped user token (`sk_…`) and stores it in `data/tokens.json`.
5. `/ask` and `/imagine` commands spend Pollen from the connected user's balance.
6. `/disconnect` removes the stored token.

Tokens survive bot restarts. Expired or revoked tokens are detected on the next API call and the user is prompted to re-authorize.

## Slash commands

| Command | Description |
|---|---|
| `/connect` | Link your Pollinations account (device flow) |
| `/disconnect` | Remove your stored authorization |
| `/ask <prompt>` | Generate text using your Pollen |
| `/imagine <prompt>` | Generate an image using your Pollen |

## Setup

### 1. Create a Discord application

- Go to the [Discord developer portal](https://discord.com/developers/applications) → **New Application**.
- Under **Bot**, create a bot and copy its token (`DISCORD_TOKEN`).
- Note the **Application ID** (`CLIENT_ID`).
- Under **OAuth2 → URL Generator**, select scopes `bot` + `applications.commands`, permission `Send Messages`, and invite the bot to your server.

### 2. Create a Pollinations App Key

- Sign in at <https://enter.pollinations.ai/keys> → **Create New App Key**.
- Copy the `pk_…` key — this is your `APP_KEY`.
- No redirect URI is needed for the device flow.

### 3. Install dependencies

```bash
npm install
```

### 4. Register slash commands

```bash
DISCORD_TOKEN=... CLIENT_ID=... node register.js
```

For instant propagation during development, add `GUILD_ID=<your-server-id>`.

### 5. Run the bot

```bash
DISCORD_TOKEN=... CLIENT_ID=... APP_KEY=pk_... node bot.js
```

Environment variables:

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Bot token from the Discord developer portal |
| `CLIENT_ID` | Yes | Discord application ID |
| `APP_KEY` | Yes | Pollinations publishable key (`pk_…`) |
| `ENTER_URL` | No | Auth base URL (default: `https://enter.pollinations.ai`) |
| `GEN_URL` | No | Generation base URL (default: `https://gen.pollinations.ai`) |

## Reproducible demo (no Discord required)

`test.js` runs the full connect → use → disconnect flow against the real Pollinations API without needing a Discord server:

```bash
APP_KEY=pk_... node test.js
```

The script:
1. Starts a device flow and prints the verification URL + user code.
2. Polls until you approve in your browser.
3. Generates text using the issued token.
4. Generates an image using the issued token.
5. Revokes the token.

## Privacy

- User tokens are stored only in `data/tokens.json` on the bot's host (gitignored).
- The authorization code is sent via DM (private) when possible; otherwise via an ephemeral channel message visible only to the user.
- Token values never appear in public messages or logs.
- Users can revoke issued tokens at any time from the [Pollinations dashboard](https://enter.pollinations.ai/keys).
