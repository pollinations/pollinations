# polly-ai 🤖

Automated Reddit bot for r/pollinations_ai subreddit that posts updates about pollinations.ai.

## Architecture

```mermaid
graph TD
    A[main.ts<br/>Entry Point] --> B[pipeline.ts]
    D[.env<br/>Configuration] -.-> B
    
    B --> C["getMergedPRsFromPreviousDay<br/>GitHub GraphQL API"]
    C -->|PR Data| E{PRs Found?}
    E -->|No| F["Exit Pipeline<br/>No PRs"]
    E -->|Yes| G["createImagePrompt<br/>Pollinations API"]
    
    G -->|Generated Prompt| H["generateImage<br/>Pollinations Image API<br/>Max 2 Retries"]
    
    B --> I["generateTitleFromPRs<br/>Pollinations API"]
    I -->|Generated Title| J["Prepare Output Data<br/>TITLE & LINK"]
    
    H -->|Image URL| J
    J --> K["Write link.ts<br/>Export TITLE & LINK"]
    K --> L[main.ts<br/>Post to Reddit]
```

> Created with 💖 by [Ayushman Bhattacharya](https://github.com/Circuit-Overtime)