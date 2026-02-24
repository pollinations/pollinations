# Reddit Posting Bot (Devvit)

Posts updates to [r/pollinations_ai](https://www.reddit.com/r/pollinations_ai/) via the Devvit SDK.

## Architecture

```mermaid
graph TD
    A["script_trigger.py<br/>Entry Point"] -->|Reddit Data| B["SSH to VPS<br/>Reddit Automation Server"]
    D["Reddit Data<br/>Title + Image URL"] -.-> A
    
    B --> C["CD to Project Dir<br/>/root/reddit_post_automation"]
    C --> E["Update link.ts<br/>Write TITLE & LINK"]
    
    E --> F["Run deploy.sh"]
    F --> G["Kill Old Processes"]
    G --> H["Start devvit playtest<br/>Pollinations_ai Subreddit"]
    
    H --> I["Trigger Update<br/>Modify og_main.ts"]
    I --> J["Wait 1 Minute <br/>Monitor Post"]
    J --> K["Cleanup & Exit<br/>Git Push"]
    K --> L["Logs Available<br/>deploy.log"]
```


**Triggered by:**
- `publish_daily.py` — on daily PR merge
- `publish_weekly.py` — Sunday 18:00 UTC cron

**Required secrets:** `REDDIT_VPS_HOST`, `REDDIT_VPS_USER`, `REDDIT_VPS_SSH_KEY`

## Files

| File | Purpose |
|---|---|
| `src/main.ts` | Devvit app — reads config, uploads image, posts to Reddit |
| `bash/deploy.sh` | Deployment script triggered via SSH from CI |
| `devvit.json` | Devvit app config (permissions, triggers) |

> Created with  by [Ayushman Bhattacharya](https://github.com/Circuit-Overtime)
