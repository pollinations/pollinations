# Social Media Automation

Automated social media posting for pollinations.ai across multiple platforms.

## Platform Overview

| | LinkedIn | Twitter/X | Instagram | Discord | Reddit |
|---|---|---|---|---|---|
| **Frequency** | Wed + Fri | Daily | Daily | On PR merge + weekly | Daily |
| **Human review?** | Yes (PR) | Yes (PR) | Yes (PR) | No (automatic) | No (automatic) |
| **Publishing API** | Buffer GraphQL | Buffer GraphQL | Buffer GraphQL | Discord Webhook | Devvit (Reddit API) |
| **Content source** | Merged PRs (5d/2d) | Merged PRs (24h) | Merged PRs (24h) | PR metadata / NEWS | Merged PRs from GitHub |
| **Content type** | Text + 1 image | Text + 1 image | Text + 3-5 images | Text + 1 image | Text + 1 image |
| **Image model** | `nanobanana-pro` | `nanobanana-pro` | `nanobanana-pro` | `nanobanana-pro` | `nanobanana-pro` |
| **Text model** | `gemini-large` | `gemini-large` | `gemini-large` | `gemini-large` | `gemini-large` |

> See platform-specific READMEs for detailed pipelines: [LinkedIn](README-linkedin.md) | [Twitter](README-twitter.md) | [Instagram](README-instagram.md) | [Discord](README-discord.md) | [GitHub/NEWS](README-github.md) | [Reddit](README-reddit.md)

---

## Shared Components

### Visual Style

All visual platforms share a unified pixel art style defined in [`prompts/_shared/visual_style.md`](prompts/_shared/visual_style.md). This is injected via the `{visual_style}` placeholder in system prompts.

### Shared Prompts

| File | Placeholder | Purpose |
|------|-------------|---------|
| `_shared/about.md` | `{about}` | Company description, Pollen system, tier info |
| `_shared/visual_style.md` | `{visual_style}` | Unified pixel art visual identity |

**How it works:** `common.py`'s `load_prompt()` automatically replaces `{about}` and `{visual_style}` with shared content. Reddit's `loadPrompt.ts` does the same for its TypeScript pipeline.

### Prompt Variables

| Variable | Description |
|----------|-------------|
| `{pr_summary}` | Formatted list of merged PRs |
| `{pr_titles}` | PR title list |
| `{pr_count}` | Number of PRs |
| `{about}` | Shared company description |
| `{visual_style}` | Shared visual style definition |

---

## Setup: API Keys & Secrets

### Required GitHub Secrets

| Secret | How to get it | Used by |
|--------|---------------|---------|
| `BUFFER_ACCESS_TOKEN` | [Buffer Developer Settings](https://publish.buffer.com/settings/developer) | LinkedIn, Twitter, Instagram |
| `POLLINATIONS_TOKEN` | [enter.pollinations.ai](https://enter.pollinations.ai) | All AI generation |
| `DISCORD_WEBHOOK_URL` | Discord Server Settings > Integrations > Webhooks | Discord |
| `GITHUB_TOKEN` | Automatically provided by GitHub Actions | All scripts |
| `POLLY_BOT_APP_ID` | GitHub App settings | PR creation |
| `POLLY_BOT_PRIVATE_KEY` | GitHub App settings | PR creation |

### Buffer Setup

Buffer uses the **GraphQL API** at `https://api.buffer.com`:

1. Create a Buffer account at [buffer.com/signup](https://buffer.com/signup)
2. Connect LinkedIn, Twitter/X, and Instagram channels
3. Generate an API token at [publish.buffer.com/settings/developer](https://publish.buffer.com/settings/developer)
4. Add the token as `BUFFER_ACCESS_TOKEN` in GitHub repo secrets
5. Scripts auto-discover your organization and channels via the API

### Buffer Delivery Schedule

Defined in [`buffer-schedule.yml`](buffer-schedule.yml). Each post is generated once and delivered once at the scheduled time.

| Platform | Days | Delivery Time (UTC) |
|----------|------|---------------------|
| **LinkedIn** | Wed + Fri | 14:00 |
| **Twitter/X** | Every day | 17:00 |
| **Instagram** | Every day | 15:00 |

---

## Directory Structure

```
social/
├── README.md                 # This overview
├── README-{platform}.md      # Per-platform details
├── buffer-schedule.yml       # Buffer posting schedule
│
├── prompts/                  # AI prompts
│   ├── _shared/              # Shared: about.md, visual_style.md
│   ├── discord/              # Discord announcement prompts
│   ├── github/               # Weekly news & highlights prompts
│   ├── instagram/            # Instagram post prompts
│   ├── linkedin/             # LinkedIn post prompts
│   └── twitter/              # Twitter post prompts
│
├── scripts/                  # Python automation scripts
│   ├── common.py             # Shared utilities (prompt loading, API calls)
│   ├── buffer_stage_post.py
│   ├── buffer_utils.py
│   ├── discord_post_merged_pr.py
│   ├── discord_post_weekly_news.py
│   ├── github_update_highlights.py
│   ├── github_generate_weekly_news.py
│   ├── github_update_readme.py
│   ├── instagram_generate_post.py
│   ├── linkedin_generate_post.py
│   └── twitter_generate_post.py
│
├── news/                     # Generated content
│   └── transformed/          # Post JSONs and images
│       ├── linkedin/posts/
│       ├── twitter/posts/
│       └── instagram/posts/
│
└── reddit/                   # Devvit app (TypeScript, self-hosted)
    ├── src/
    │   ├── main.ts           # Entry point
    │   ├── pipeline.ts       # Content generation
    │   ├── loadPrompt.ts     # Prompt loading with shared injection
    │   └── system_prompt.ts  # Embedded AI prompt
    └── bash/deploy.sh        # Deployment script
```

---

## Editing Prompts

1. Edit file in `prompts/{platform}/`
2. Test via manual workflow trigger
3. Review generated PR
