# Social Media Pipeline

Automated social media posting for pollinations.ai — 3-tier event-centric architecture.

See [PIPELINE.md](PIPELINE.md) for the full design document (architecture, data flow, error handling, schemas, cost estimates, migration plan).

## Platform Overview

| | Twitter/X | LinkedIn | Instagram | Reddit | Discord |
|---|---|---|---|---|---|
| **Daily** | Buffer (scheduled) | — | Buffer (scheduled) | VPS deploy | Per-PR (realtime) |
| **Weekly** | Buffer (scheduled) | Buffer (scheduled) | Buffer (scheduled) | VPS deploy | Webhook |
| **Review** | Yes (daily PR) | Yes (weekly PR) | Yes (daily PR) | Yes (daily PR) | No (automatic) |
| **Images** | 1 per post | 1 per post | up to 3 carousel | 1 per post | 1 per PR |
| **Model** | `nanobanana-pro` | `nanobanana-pro` | `nanobanana-pro` | `nanobanana-pro` | `nanobanana-pro` |

## Delivery Schedule

Defined in [`buffer-schedule.yml`](buffer-schedule.yml).

| Platform | Daily | Weekly | Notes |
|---|---|---|---|
| **Twitter/X** | Yes | Yes | Buffer scheduled delivery |
| **LinkedIn** | — | Yes | Weekly only |
| **Instagram** | Yes | Yes | Buffer scheduled delivery |
| **Reddit** | Yes | Yes | VPS deploy on merge |
| **Discord** | Per PR (realtime) | Yes | Webhook on merge / Sun 18:00 UTC |

## Secrets

| Secret | Used by |
|---|---|
| `BUFFER_ACCESS_TOKEN` | Buffer staging (X, LI, IG) |
| `POLLINATIONS_TOKEN` | All AI generation |
| `DISCORD_WEBHOOK_URL` | Tier 1 + Tier 3 Discord posts |
| `GITHUB_TOKEN` | PR creation, file commits |
| `POLLY_BOT_APP_ID` | PR creation (GitHub App) |
| `POLLY_BOT_PRIVATE_KEY` | PR creation (GitHub App) |
| `REDDIT_VPS_HOST` | Reddit VPS deployment |
| `REDDIT_VPS_USER` | Reddit VPS deployment |
| `REDDIT_VPS_SSH_KEY` | Reddit VPS SSH key (base64) |

## Legacy

The old per-platform standalone scripts and workflows have been removed. The 3-tier pipeline above replaces all of them.

The old Devvit-based Reddit pipeline (`social/reddit/`) is also superseded — Reddit now posts via SSH deployment to a VPS in `publish_daily.py` and `publish_weekly.py`.
