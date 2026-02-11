# Discord Pipeline

Automatic PR announcements and weekly news digests posted via webhook.

## Overview

| | |
|---|---|
| **Frequency** | On every PR merge + weekly |
| **Content type** | Text + 1 image |
| **Image size** | 2048x2048px |
| **Image model** | `nanobanana-pro` |
| **Text model** | `gemini-large` |
| **Tone** | Dev community announcement |
| **Human review** | No — automatic |
| **Publishing API** | Discord Webhook |

## Pipeline Flow

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'lineColor': '#ffffff' }}}%%
flowchart TD
    A["Any PR merged"]:::trigger --> B["discord_post_merged_pr.py"]:::script
    B --> C["AI generates announcement"]:::ai
    C --> D["AI generates pixel art image"]:::ai
    D --> E["Posts to Discord immediately"]:::output

    F["NEWS.md merged"]:::trigger --> G["discord_post_weekly_news.py"]:::script
    G --> H["AI generates digest"]:::ai
    H --> I["AI generates pixel art image"]:::ai
    I --> J["Posts weekly summary"]:::output

    classDef trigger fill:#f59e0b,stroke:#fff,stroke-width:2px,color:#000
    classDef script fill:#3b82f6,stroke:#fff,stroke-width:2px,color:#fff
    classDef ai fill:#a855f7,stroke:#fff,stroke-width:2px,color:#fff
    classDef output fill:#22c55e,stroke:#fff,stroke-width:2px,color:#000

    linkStyle default stroke:#ffffff,stroke-width:3px
```

## Two Triggers

1. **PR Merge** — `pull_request_target` closed+merged triggers `discord_post_merged_pr.py` immediately
2. **Weekly NEWS** — Push to `main` matching `social/news/*.md` triggers `discord_post_weekly_news.py`

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/discord_post_merged_pr.py` | Posts individual PR announcement + image to Discord |
| `scripts/discord_post_weekly_news.py` | Posts weekly news digest + image to Discord |

## Prompts

| File | Purpose |
|------|---------|
| `prompts/discord/merged_pr_system.md` | System prompt for PR announcements |
| `prompts/discord/merged_pr_user.md` | User prompt with PR details |
| `prompts/discord/weekly_news_system.md` | System prompt for weekly digest |
| `prompts/discord/weekly_news_user.md` | User prompt with news content |
| `prompts/discord/image_prompt_system.md` | System prompt for image generation |

## Secrets Required

`DISCORD_WEBHOOK_URL`, `POLLINATIONS_TOKEN`, `GITHUB_TOKEN`
