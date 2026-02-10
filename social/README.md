# Social Media Pipeline

Automated social media posting for pollinations.ai — 3-tier event-centric architecture.

See [PIPELINE.md](PIPELINE.md) for the full design document (architecture, data flow, error handling, schemas, cost estimates, migration plan).

## Platform Overview

| | Twitter/X | LinkedIn | Instagram | Reddit | Discord |
|---|---|---|---|---|---|
| **Daily** | Buffer 17:00 UTC | Buffer 14:00 UTC (Wed+Fri) | Buffer 15:00 UTC | Reddit API (immediate) | Per-PR (immediate) |
| **Weekly** | Buffer Mon 08:00 | Buffer Mon 08:00 | Buffer Mon 08:00 | Reddit API (immediate) | Webhook Mon 08:00 |
| **Review** | Yes (daily PR) | Yes (daily PR) | Yes (daily PR) | Yes (daily PR) | No (automatic) |
| **Images** | 1 per post | 1 per post | up to 3 carousel | 1 per post | 1 per PR |
| **Model** | `nanobanana-pro` | `nanobanana-pro` | `nanobanana-pro` | `nanobanana-pro` | `nanobanana-pro` |

## Delivery Schedule

Defined in [`buffer-schedule.yml`](buffer-schedule.yml).

| Platform | Daily | Weekly | Time (UTC) |
|---|---|---|---|
| **Twitter/X** | Every day | Monday | 17:00 / 08:00 |
| **LinkedIn** | Wed + Fri | Monday | 14:00 / 08:00 |
| **Instagram** | Every day | Monday | 15:00 / 08:00 |
| **Reddit** | Every day | Monday | Immediate on merge |
| **Discord** | Per PR merge | Monday | Immediate / 08:00 |

## Secrets

| Secret | Used by |
|---|---|
| `BUFFER_ACCESS_TOKEN` | Buffer staging (X, LI, IG) |
| `POLLINATIONS_TOKEN` | All AI generation |
| `DISCORD_WEBHOOK_URL` | Tier 1 + Tier 3 Discord posts |
| `GITHUB_TOKEN` | PR creation, file commits |
| `POLLY_BOT_APP_ID` | PR creation (GitHub App) |
| `POLLY_BOT_PRIVATE_KEY` | PR creation (GitHub App) |
| `REDDIT_CLIENT_ID` | Reddit OAuth2 posting |
| `REDDIT_CLIENT_SECRET` | Reddit OAuth2 posting |
| `REDDIT_USERNAME` | Reddit bot account |
| `REDDIT_PASSWORD` | Reddit bot account |

## Legacy

The old per-platform standalone scripts and workflows have been removed. The 3-tier pipeline above replaces all of them.

The old Devvit-based Reddit pipeline (`social/reddit/`) is also superseded — Reddit now posts via direct OAuth2 API in `publish_daily.py`.
