# Social Media Pipeline

Automated social media posting for pollinations.ai — 3-tier event-centric architecture.

## Architecture

```
TIER 1: PER-PR (on merge, real-time)
  PR merged → generate_pr_gist.py → gist JSON + image → Discord post

TIER 2: DAILY (00:00 UTC)
  Read gists → generate_daily_summary.py → platform posts (X, LI, IG, Reddit) + diary
  → single PR for review → on merge: publish_daily.py (Buffer + Reddit API + highlights + README)

TIER 3: WEEKLY (Sunday → Monday)
  Read daily summaries → generate_weekly_summary.py → platform posts (X, LI, IG, Discord)
  → PR for review → Monday 08:00 UTC: publish_weekly.py (Buffer + Discord webhook)
```

See [PIPELINE.md](PIPELINE.md) for the full design document.

## Platform Overview

| | Twitter/X | LinkedIn | Instagram | Reddit | Discord |
|---|---|---|---|---|---|
| **Daily** | Buffer 17:00 UTC | Buffer 14:00 UTC (Wed+Fri) | Buffer 15:00 UTC | Reddit API (immediate) | Per-PR (immediate) |
| **Weekly** | Buffer Mon 08:00 | Buffer Mon 08:00 | Buffer Mon 08:00 | -- | Webhook Mon 08:00 |
| **Review** | Yes (daily PR) | Yes (daily PR) | Yes (daily PR) | Yes (daily PR) | No (automatic) |
| **Images** | 1 per post | 1 per post | 3-5 carousel | 1 per post | 1 per PR |
| **Model** | `nanobanana-pro` | `nanobanana-pro` | `nanobanana-pro` | `nanobanana-pro` | `nanobanana-pro` |

## Workflows

| Workflow | Trigger | Script |
|---|---|---|
| `NEWS_pr_gist.yml` | PR merged to main | `generate_pr_gist.py` |
| `NEWS_daily_summary.yml` | Cron 00:00 UTC daily | `generate_daily_summary.py` |
| `NEWS_daily_publish.yml` | Daily PR merged (`social/news/daily/**`) | `publish_daily.py` |
| `NEWS_weekly_summary.yml` | Cron Sunday 00:00 UTC | `generate_weekly_summary.py` |
| `NEWS_weekly_publish.yml` | Cron Monday 08:00 UTC | `publish_weekly.py` |

## Scripts

| Script | Tier | Purpose |
|---|---|---|
| `generate_pr_gist.py` | 1 | AI analyzes PR → gist JSON + image → Discord post |
| `generate_daily_summary.py` | 2 | Clusters gists into arcs → twitter/linkedin/instagram/reddit JSONs + diary + images → PR |
| `publish_daily.py` | 2 | On daily PR merge → Buffer (X, LI, IG) + Reddit API + highlights + README |
| `generate_weekly_summary.py` | 3 | Synthesizes daily summaries → all platform posts + images → PR |
| `publish_weekly.py` | 3 | Monday cron → Buffer (X, LI, IG) + Discord webhook |
| `common.py` | -- | Shared utilities: prompt loading, API calls, gist I/O |
| `buffer_stage_post.py` | -- | Buffer API staging with scheduled delivery |
| `buffer_utils.py` | -- | Buffer GraphQL helpers |

## Prompts

### Shared (`prompts/_shared/`)

| File | Placeholder | Purpose |
|---|---|---|
| `brand_about.md` | `{about}` | Company description, tiers, brand identity |
| `brand_visual.md` | `{visual_style}` | Cozy 8-bit pixel art style guide, color palette |
| `pr_analyzer.md` | -- | Tier 1: Analyzes PRs into structured gist JSON |
| `daily_summary.md` | -- | Tier 2: Clusters gists into narrative arcs |
| `daily_diary.md` | -- | Tier 2: Whimsical pixel art dev diary entries |
| `weekly_summary.md` | -- | Tier 3: Synthesizes weekly recap from dailies |

`common.py`'s `load_prompt()` auto-injects `{about}` and `{visual_style}` into all prompts.

### Per-Platform (`prompts/{platform}/`)

| Folder | Files | Tone |
|---|---|---|
| `twitter/` | system, user_with_prs, user_engagement | Builder credibility, substance with personality |
| `linkedin/` | system, user_with_prs, user_thought_leadership | Professional, milestone-focused |
| `instagram/` | system, user_with_prs, user_brand_content | Gen-Z aesthetic, carousel support |
| `reddit/` | system | Factual, dev meme energy, non-promotional |
| `discord/` | merged_pr_system/user, weekly_news_system/user, image_prompt_system | Dev community announcement |
| `github/` | highlights_system/user, weekly_news_system/user/user_final | Markdown changelogs |

## Storage

```
social/news/
├── gists/YYYY-MM-DD/                    # Tier 1: per-PR gists
│   ├── PR-{number}.json                 #   structured gist
│   └── PR-{number}.jpg                  #   pixel art image
├── daily/YYYY-MM-DD/                    # Tier 2: daily posts
│   ├── summary.json                     #   narrative arcs
│   ├── diary.json                       #   dev diary
│   ├── twitter.json, linkedin.json      #   platform posts
│   ├── instagram.json, reddit.json      #   platform posts
│   └── images/                          #   generated images
│       ├── twitter.jpg, linkedin.jpg
│       ├── instagram-{1,2,3}.jpg
│       └── reddit.jpg
├── weekly/YYYY-MM-DD/                   # Tier 3: weekly posts
│   ├── summary.md                       #   changelog
│   ├── twitter.json, linkedin.json      #   platform posts
│   ├── instagram.json, discord.json     #   platform posts
│   └── images/                          #   generated images
├── highlights.md                        # Curated highlights (updated on daily publish)
└── LINKS.md                             # Official link collection
```

## Delivery Schedule

Defined in [`buffer-schedule.yml`](buffer-schedule.yml).

| Platform | Daily | Weekly | Time (UTC) |
|---|---|---|---|
| **Twitter/X** | Every day | Monday | 17:00 / 08:00 |
| **LinkedIn** | Wed + Fri | Monday | 14:00 / 08:00 |
| **Instagram** | Every day | Monday | 15:00 / 08:00 |
| **Reddit** | Every day | -- | Immediate on daily PR merge |
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
