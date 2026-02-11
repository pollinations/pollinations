# GitHub / NEWS Pipeline

Weekly news generation, highlights updates, and README updates — all automated via chained workflows.

## Overview

| | |
|---|---|
| **Frequency** | Weekly (Monday) |
| **Trigger** | Cron `0 0 * * 1` (Mon midnight UTC) |
| **Content type** | Markdown (news + highlights) |
| **Text model** | `gemini-large` |
| **Human review** | Yes — PR before each step |

## Pipeline Flow

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'lineColor': '#ffffff' }}}%%
flowchart TD
    A["Monday 00:00 UTC"]:::trigger --> B["github_generate_weekly_news.py"]:::script
    B --> C["Scans merged PRs via GraphQL"]:::process
    C --> D["Creates PR: social/news/YYYY-MM-DD.md"]:::pr
    D -->|PR merged| E{"Two workflows trigger"}:::branch
    E --> F["discord_post_weekly_news.py"]:::script
    E --> G["github_update_highlights.py"]:::script
    F --> H["Posts digest to Discord"]:::output
    G --> I["AI extracts top highlights"]:::ai
    I --> J["Creates PR: highlights.md"]:::pr
    J -->|PR merged| K["github_update_readme.py"]:::script
    K --> L["Updates README Latest News"]:::output

    classDef trigger fill:#f59e0b,stroke:#fff,stroke-width:2px,color:#000
    classDef script fill:#3b82f6,stroke:#fff,stroke-width:2px,color:#fff
    classDef process fill:#6366f1,stroke:#fff,stroke-width:2px,color:#fff
    classDef ai fill:#a855f7,stroke:#fff,stroke-width:2px,color:#fff
    classDef pr fill:#f97316,stroke:#fff,stroke-width:2px,color:#000
    classDef output fill:#22c55e,stroke:#fff,stroke-width:2px,color:#000
    classDef branch fill:#64748b,stroke:#fff,stroke-width:2px,color:#fff

    linkStyle default stroke:#ffffff,stroke-width:3px
```

## 4-Step Chain

| Step | Trigger | Script | Creates | Triggers next |
|------|---------|--------|---------|---------------|
| 1. Generate weekly news | Cron Mon 00:00 UTC | `github_generate_weekly_news.py` | PR with `social/news/YYYY-MM-DD.md` | On PR merge: steps 2 + 3 |
| 2. Post to Discord | Push to `main` with `social/news/*.md` | `discord_post_weekly_news.py` | Discord message | -- |
| 3. Update highlights | PR merge with `social/news/*.md` | `github_update_highlights.py` | PR with `social/news/transformed/highlights.md` | On PR merge: step 4 |
| 4. Update README | PR merge with `social/news/transformed/highlights.md` | `github_update_readme.py` | Updates repo `README.md` "Latest News" section | -- |

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/github_generate_weekly_news.py` | Scans PRs, generates weekly news markdown |
| `scripts/github_update_highlights.py` | Extracts top highlights from news |
| `scripts/github_update_readme.py` | Updates repo README with latest highlights |

## Prompts

| File | Purpose |
|------|---------|
| `prompts/github/weekly_news_system.md` | System prompt for weekly news |
| `prompts/github/weekly_news_user.md` | User prompt for news generation |
| `prompts/github/weekly_news_user_final.md` | Final formatting prompt |
| `prompts/github/highlights_system.md` | System prompt for highlights |
| `prompts/github/highlights_user.md` | User prompt with NEWS content |

## Secrets Required

`POLLINATIONS_TOKEN`, `GITHUB_TOKEN`, `POLLY_BOT_APP_ID`, `POLLY_BOT_PRIVATE_KEY`
