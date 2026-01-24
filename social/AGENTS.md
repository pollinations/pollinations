# Social Media Automation

Documentation for social media platforms managed in this folder: Reddit, Twitter/X, LinkedIn.

## Directory Structure

```
social/
├── prompts/           # AI prompts for post generation
│   ├── linkedin/      # LinkedIn system + user prompts
│   └── twitter/       # Twitter system + user prompts
├── scripts/           # Python scripts for automation
│   ├── common.py      # Shared utilities (PR fetching, API calls, image gen)
│   ├── linkedin_generate_post.py
│   ├── twitter_generate_post.py
│   ├── buffer_utils.py
│   └── buffer_publish_post.py
├── news/
│   └── transformed/
│       ├── linkedin/posts/  # Generated LinkedIn post JSONs
│       └── twitter/posts/   # Generated Twitter post JSONs
└── reddit/            # Reddit Devvit app (separate stack)
```

## LinkedIn

Weekly professional posts about development updates.

### Workflow

1. **Generate**: `linkedin-generate-post.yml` runs Monday 14:00 UTC
2. **Review**: Creates PR with post JSON + generated image
3. **Publish**: On merge, `buffer-publish-post.yml` posts to LinkedIn via Buffer

### Prompts

- `prompts/linkedin/system.md` - Persona, voice, image generation guidelines
- `prompts/linkedin/user_with_prs.md` - When there are merged PRs
- `prompts/linkedin/user_thought_leadership.md` - When no PRs (thought leadership)

### Configuration

| Env Variable | Purpose |
|-------------|---------|
| `POLLINATIONS_TOKEN` | AI generation API |
| `BUFFER_ACCESS_TOKEN` | Buffer publishing |
| `DAYS_BACK` | Days to scan for PRs (default: 7) |
| `FORCE_THOUGHT_LEADERSHIP` | Skip PRs, generate thought leadership |

## Twitter/X

Daily casual posts with meme-style images.

### Workflow

1. **Generate**: `twitter-generate-post.yml` runs daily 15:00 UTC
2. **Review**: Creates PR with tweet JSON + generated meme image
3. **Publish**: On merge, `buffer-publish-post.yml` posts to Twitter via Buffer

### Prompts

- `prompts/twitter/system.md` - Persona, voice, meme image guidelines
- `prompts/twitter/user_with_prs.md` - When there are merged PRs
- `prompts/twitter/user_engagement.md` - When no PRs (engagement content)

### Configuration

| Env Variable | Purpose |
|-------------|---------|
| `POLLINATIONS_TOKEN` | AI generation API |
| `BUFFER_ACCESS_TOKEN` | Buffer publishing |
| `DAYS_BACK` | Days to scan for PRs (default: 1) |
| `FORCE_ENGAGEMENT` | Skip PRs, generate engagement content |

### Constraints

- **280 character limit** - Scripts validate and truncate if needed
- 1-2 hashtags max (Twitter users hate hashtag spam)

## Reddit

Automated bot for **r/pollinations_ai** subreddit.

**Note**: This is a self-hosted Devvit app, not a GitHub Action.

### Stack

- **Framework**: [Devvit](https://developers.reddit.com/docs/)
- **Language**: TypeScript
- **Location**: `social/reddit/`

### Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Entry point, Devvit config |
| `src/pipeline.ts` | Content generation pipeline |
| `src/link.ts` | Reddit API utilities |
| `devvit.json` | Devvit app configuration |

### Deployment

```bash
cd social/reddit
npm install
devvit upload
```

## Buffer Integration

Both LinkedIn and Twitter use [Buffer](https://buffer.com) for publishing.

### How it works

1. Post generator creates JSON in `news/transformed/{platform}/posts/`
2. PR is created for review
3. On merge, `buffer-publish-post.yml` triggers
4. Script reads JSON, calls Buffer API to publish

### Buffer API

- Base URL: `https://api.bufferapp.com/1`
- Auth: Access token via `BUFFER_ACCESS_TOKEN` secret
- Profiles: Fetched dynamically by service name

## Editing Prompts

Prompts are markdown files, easy to iterate:

1. Edit the relevant file in `prompts/{platform}/`
2. Test by running the workflow manually (workflow_dispatch)
3. Review generated content in the PR

### Prompt Variables

| Variable | Used In | Description |
|----------|---------|-------------|
| `{pr_summary}` | system.md | Formatted list of merged PRs |
| `{pr_titles}` | user_with_prs.md | List of PR titles |
| `{pr_count}` | user_with_prs.md | Number of merged PRs |

## Common Utilities

`scripts/common.py` provides shared functions:

- `load_prompt(platform, name)` - Load prompt from markdown file
- `get_merged_prs(...)` - Fetch PRs via GitHub GraphQL
- `call_pollinations_api(...)` - Text generation with retry
- `generate_image(...)` - Image generation with retry
- `format_pr_summary(...)` - Format PRs for prompts
