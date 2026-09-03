# Discord Agent: Researcher

A small Discord slash-command adapter for the public managed agent `AkshayCoder48/researcher`.

## Verified model

On 2026-09-01, `GET https://gen.pollinations.ai/v1/models` returned this exact entry with `agent: true`, `base_model: "laguna"`, and text chat support:

```json
{"id":"AkshayCoder48/researcher","agent":true,"base_model":"laguna","supported_endpoints":["/v1/chat/completions","/text","/text/{prompt}"]}
```

The model ID is pinned in `bot.js`; it is not inferred from a user command.

## Setup

Create a Discord application/bot and a Pollinations publishable App Key (`pk_...`) at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys). Copy `.env.example` to `.env`, then set:

```text
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
POLLINATIONS_APP_KEY=pk_...
TOKEN_STORE_PATH=./data/tokens.json
```

Install and register commands:

```bash
npm install
npm run register
npm start
```

Set `DISCORD_GUILD_ID` while developing for immediate guild command updates; omit it to register global commands.

## Commands

- `/connect` privately sends a BYOP device authorization link and waits for approval. The resulting delegated `sk_...` key is stored per Discord user in an atomic, local-only JSON file.
- `/ask question:<text>` sends one self-contained research request to the pinned managed agent with that user’s delegated key. The answer is public; missing credentials and errors are private-safe messages.
- `/disconnect` deletes the local token. Server-side revocation is done by the user from [the account keys page](https://enter.pollinations.ai/keys); the bot never attempts to revoke it.

Each request is intentionally independent: the bot does not store or replay conversation history into later research tasks.

Never commit `data/tokens.json`, `.env`, bot tokens, App Keys, or delegated keys.
