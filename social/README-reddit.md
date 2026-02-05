# Reddit Pipeline

Daily pixel art posts to r/pollinations_ai via a self-hosted Devvit app (TypeScript).

## Overview

| | |
|---|---|
| **Frequency** | Daily |
| **Trigger** | Systemd timer |
| **Content source** | Merged PRs from GitHub |
| **Content type** | Text + 1 image |
| **Image size** | 2048x2048px |
| **Image model** | `nanobanana-pro` |
| **Text model** | `gemini-large` |
| **Tone** | Factual, informative, dev meme energy |
| **Human review** | No — automatic |
| **Publishing API** | Devvit (Reddit API) |

## Pipeline Flow

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'lineColor': '#ffffff' }}}%%
flowchart TD
    A["Systemd timer daily"]:::trigger --> B["pipeline.ts"]:::script
    B --> C["Fetch PRs from GitHub"]:::process
    C --> D["AI generates title + image prompt"]:::ai
    D --> E["Creates pixel art infographic"]:::ai
    E --> F["Posts to r/pollinations_ai"]:::output

    classDef trigger fill:#f59e0b,stroke:#fff,stroke-width:2px,color:#000
    classDef script fill:#3b82f6,stroke:#fff,stroke-width:2px,color:#fff
    classDef process fill:#6366f1,stroke:#fff,stroke-width:2px,color:#fff
    classDef ai fill:#a855f7,stroke:#fff,stroke-width:2px,color:#fff
    classDef output fill:#22c55e,stroke:#fff,stroke-width:2px,color:#000

    linkStyle default stroke:#ffffff,stroke-width:3px
```

## Architecture

Unlike other platforms (Python + GitHub Actions), Reddit uses a **self-hosted TypeScript Devvit app**.

| Component | File | Purpose |
|-----------|------|---------|
| Entry Point | `reddit/src/main.ts` | Devvit app, posts to Reddit on AppUpgrade |
| Content Pipeline | `reddit/src/pipeline.ts` | Fetches PRs, generates prompt, title, image |
| Prompt Loader | `reddit/src/loadPrompt.ts` | Loads prompts with `{about}` and `{visual_style}` injection |
| System Prompt | `reddit/src/system_prompt.ts` | Embedded AI prompt |
| Deploy Script | `reddit/bash/deploy.sh` | Orchestrates full pipeline |

## Prompts

Reddit uses **external prompt files** loaded by `loadPrompt.ts`, plus an embedded system prompt:

| File | Purpose |
|------|---------|
| `prompts/reddit/system.md` | System prompt — factual tone, dev meme pixel art |
| `prompts/reddit/user_with_prs.md` | User prompt when PRs are available |
| `reddit/src/system_prompt.ts` | Embedded fallback system prompt |

Uses shared placeholders: `{about}`, `{visual_style}`, `{pr_summary}`

## Deployment

See `reddit/README.md` for the full Devvit deployment guide.

## Secrets Required

Configured on the self-hosted server (not GitHub Secrets): Devvit credentials, `POLLINATIONS_TOKEN`, `GITHUB_TOKEN`
