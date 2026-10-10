# Social Media Pipeline

Automated news posts for pollinations.ai, built from one note ("gist") per merged PR.

See [PIPELINE.md](PIPELINE.md) for the design: tiers, data flow, storage, error handling.

## Platforms

| | Twitter/X | LinkedIn | Instagram | Discord |
|---|---|---|---|---|
| **Per PR** | — | — | — | Webhook, right after the note |
| **Daily** | Buffer | — | — | — |
| **Weekly** | Buffer | Buffer | Buffer (up to 3 images) | Webhook, Sunday 18:00 UTC |
| **Model news** | — | — | — | Webhook, Wednesday 14:00 UTC |

Images use `nanobanana-2-lite`. Buffer delivery times are in [`buffer-schedule.yml`](buffer-schedule.yml).

## Secrets

| Secret | Used by |
|---|---|
| `PLN_GITHUB_NEWS_KEY` | AI text and images (passed to the scripts as `POLLINATIONS_TOKEN`) |
| `POLLY_BOT_APP_ID`, `POLLY_BOT_PRIVATE_KEY` | GitHub App token: commits to the `news` branch, README PR |
| `BUFFER_ACCESS_TOKEN` | Buffer staging (X, LinkedIn, Instagram). A personal Buffer API key; Buffer keys expire, check the date in Buffer → Settings → API |
| `DISCORD_REALTIME_WEBHOOK_URL` | Per-PR Discord post |
| `DISCORD_WEEKLY_WEBHOOK_URL` | Weekly Discord post |
| `DISCORD_MODELS_WEBHOOK_URL`, `DISCORD_MODELS_ROLE_ID` | Wednesday model news |
