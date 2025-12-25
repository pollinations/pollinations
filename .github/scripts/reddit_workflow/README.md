# polly-ai 🤖

Automated Reddit bot for r/pollinations_ai subreddit that posts updates about pollinations.ai.

## Architecture

```mermaid
graph TD
    A[main.ts<br/>Entry Point] --> B[pipeline.ts<br/>Content Pipeline]
    B --> C[link.ts<br/>Reddit API Utils]
    D[.env<br/>Configuration] -.-> A
    D -.-> B
    D -.-> C
    
    B -->|Process Content| E[Generate Posts]
    C -->|Reddit Integration| F[Post to Subregddit]
```

> Created with 💖 by [Ayushman Bhattacharya](https://github.com/Circuit-Overtime)