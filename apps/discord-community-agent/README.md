# Discord Community Agent

A minimal Discord adapter for the public Pollinations Community Agent
[`AkshayCoder48/tutor`](https://enter.pollinations.ai/my-models), with
**BYOP device authorization** — users connect their own Pollinations wallet
and the bot spends *their* Pollen. No API key is ever pasted into Discord.

## Why this agent

`tutor` is a public managed agent (base model `openai-fast`), so it answers
quickly and conversationally — a natural fit for Discord Q&A. It is called
by its callable model ID exactly like any text model
(`POST https://gen.pollinations.ai/v1/chat/completions` with
`model: "AkshayCoder48/tutor"`). Any public Community Agent can be used by
changing one constant (`AGENT_MODEL` in `pollinations.js`).

The hosted agent remains the single source of behavior: this app never
contains its system prompt or agent logic, it only forwards messages.

## Commands

| Command | Description |
| --- | --- |
| `/connect` | Starts device authorization and DMs you the verification link + code |
| `/chat <prompt>` | Sends your message (with Discord context) to the agent using your Pollen |
| `/disconnect` | Removes your stored key from the bot |

Prompts are capped at **4000 characters** (`MAX_PROMPT_LENGTH`) so a single
message cannot burn an unbounded amount of the user's Pollen. Expired or
revoked keys are detected on the next `/chat`, removed locally, and the
user is pointed back to `/connect`.

## Resilience

- Transient upstream failures (network errors, `429`, `5xx`) are retried up
  to 3 times with exponential backoff, honoring the `Retry-After` header
  when the server sends one. Auth failures (`401`/`403`) are never retried —
  they drop the stored key and ask the user to `/connect`.
- Malformed agent responses (missing `choices[0].message.content`) surface
  as a fixed, user-safe error instead of a crash.
- Discord-side rate limiting is handled by discord.js itself: it queues
  outgoing REST calls and respects Discord's `Retry-After` responses.

## Setup

1. **Discord application** — <https://discord.com/developers/applications> →
   *New Application* → *Bot* → copy the token (`DISCORD_TOKEN`) and the
   *Application ID* (`CLIENT_ID`). Invite the bot with the `bot` +
   `applications.commands` scopes.
2. **Pollinations App Key** — <https://enter.pollinations.ai/keys> →
   *Create New App Key* → copy the `pk_...` key (`APP_KEY`). This identifies
   the bot for attribution and isolates each user's delegated key. No
   redirect URI is needed for the device flow.
3. Install and register commands:

   ```bash
   npm install
   DISCORD_TOKEN=... CLIENT_ID=... GUILD_ID=<dev-server-id> npm run register
   ```

4. Run the bot:

   ```bash
   DISCORD_TOKEN=... APP_KEY=pk_... npm start
   ```

| Env var | Required | Default |
| --- | --- | --- |
| `DISCORD_TOKEN` | yes | — |
| `APP_KEY` | yes | — |
| `CLIENT_ID` | register only | — |
| `GUILD_ID` | no | global commands |
| `TOKEN_STORE_PATH` | no | `./data/tokens.json` |
| `TOKEN_STORE_SECRET` | no | off (plaintext store) |
| `ENTER_URL` / `GEN_URL` | no | production Pollinations |

## Test / reproducible demo

`npm test` runs the full **connect → use → disconnect** flow against mocked
Discord and Pollinations APIs (no tokens needed), plus the expired-key,
denied-authorization, retry/backoff, malformed-response, prompt-length and
encrypted-store paths. The same functions are exercised end-to-end in
production by `/connect`, `/chat`, and `/disconnect`.

## Security

- Users authorize through the browser (RFC 8628 device flow); nothing secret
  is typed into Discord.
- The verification link/code is sent by DM, falling back to an ephemeral
  (user-only) reply if DMs are closed.
- Per-user keys live only in `data/tokens.json`. Writes are atomic
  (temp file + rename), so a crash mid-write cannot corrupt the store;
  the file is mode `0600` and gitignored, and keys never appear in public
  messages or logs — errors shown to users are fixed, credential-free
  messages.
- Set `TOKEN_STORE_SECRET` to encrypt the store at rest with AES-256-GCM
  (fresh IV per write, key derived via scrypt). It is off by default: for a
  self-hosted example bot a plaintext `0600` file is an honest threat
  model, while the option covers shared-host deployments.
- Users can disconnect anytime, and can revoke the key itself from
  <https://enter.pollinations.ai/keys>.
