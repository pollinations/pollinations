# Instagram Pipeline

Daily pixel art posts with carousel support, published via Buffer.

## Overview

| | |
|---|---|
| **Generation** | Daily at midnight UTC |
| **Delivery** | Same day at 15:00 UTC via Buffer |
| **Lookback** | 1 day — matches gap since last generation |
| **Content type** | Text + 3-5 images (carousel) |
| **Image size** | 2048x2048px |
| **Image model** | `nanobanana-pro` |
| **Text model** | `gemini-large` + `perplexity-reasoning` |
| **Tone** | Gen-Z aesthetic, cozy pixel art, community-focused |
| **Human review** | Yes — PR before publish |
| **Publishing API** | Buffer GraphQL (`api.buffer.com`) |
| **Fallback** | Brand content post (when no PRs) |

## Pipeline Flow

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'lineColor': '#ffffff' }}}%%
flowchart TD
    A["Daily midnight UTC"]:::trigger --> B["instagram_generate_post.py"]:::script
    B --> C["Scan recent PRs"]:::process
    C --> D["AI generates caption + 3-5 images"]:::ai
    D --> E["Creates PR with post JSON"]:::pr
    E -->|PR merged| F["buffer_publish_post.py"]:::script
    F --> G["Delivers same day at 15:00 UTC"]:::output

    classDef trigger fill:#f59e0b,stroke:#fff,stroke-width:2px,color:#000
    classDef script fill:#3b82f6,stroke:#fff,stroke-width:2px,color:#fff
    classDef process fill:#6366f1,stroke:#fff,stroke-width:2px,color:#fff
    classDef ai fill:#a855f7,stroke:#fff,stroke-width:2px,color:#fff
    classDef pr fill:#f97316,stroke:#fff,stroke-width:2px,color:#000
    classDef output fill:#22c55e,stroke:#fff,stroke-width:2px,color:#000

    linkStyle default stroke:#ffffff,stroke-width:3px
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/instagram_generate_post.py` | Fetches PRs, generates post JSON with carousel images |
| `scripts/buffer_publish_post.py` | Publishes to Buffer with scheduled delivery |

## Prompts

| File | Purpose |
|------|---------|
| `prompts/instagram/system.md` | System prompt — Gen-Z tone, pixel art, carousel support |
| `prompts/instagram/user_with_prs.md` | User prompt when PRs are available |
| `prompts/instagram/user_brand_content.md` | Fallback user prompt (no PRs) |

Uses shared placeholders: `{visual_style}`, `{pr_titles}`

## Post Output

JSON stored at `news/transformed/instagram/posts/YYYY-MM-DD.json`

## Workflow Inputs

| Variable | Purpose | Default |
|----------|---------|---------|
| `DAYS_BACK` | Days to scan for PRs | 1 |
| `FORCE_BRAND_CONTENT` | Skip PRs, generate brand content | false |

## Secrets Required

`BUFFER_ACCESS_TOKEN`, `POLLINATIONS_TOKEN`, `GITHUB_TOKEN`, `POLLY_BOT_APP_ID`, `POLLY_BOT_PRIVATE_KEY`
