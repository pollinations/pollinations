# GitHub Workflows

## Authentication

Most workflows use **Polly Bot** (GitHub App) for authentication instead of personal access tokens. This provides:

-   Better security (scoped permissions)
-   Actions appear as bot, not a user
-   No PAT expiration issues

Secrets required: `POLLY_BOT_APP_ID`, `POLLY_BOT_PRIVATE_KEY`

## Label System

### Inbox Labels (Triage)

| Label           | Purpose                          | Applied by                                   |
| --------------- | -------------------------------- | -------------------------------------------- |
| `inbox:github`  | External issue needs triage      | `github-issue-labeler.yml`                   |
| `inbox:discord` | Issue created from Discord       | `discord-create-issue.yml` (via Discord bot) |
| `inbox:news`    | PR related to weekly news update | `github-weekly-pr-to-news.yml`               |

### App Submission Labels

| Label             | Purpose                       | Applied by       |
| ----------------- | ----------------------------- | ---------------- |
| `app:review`      | App submission pending review | Issue template   |
| `app:info-needed` | Awaiting submitter response   | `app-review.yml` |
| `app:approved`    | App merged to showcase        | `app-merged.yml` |
| `app:denied`      | Submission rejected           | Manual           |

## Workflows

### Triage

-   **github-issue-labeler.yml** - Adds `inbox:github` to external issues. Skips if `inbox:discord` or `app:*` labels exist.
-   **discord-create-issue.yml** - Creates GitHub issues from Discord bot via `repository_dispatch`.

### App Submissions

-   **app-review.yml** - AI-powered review of app submissions. Parses issue, creates PR to add project.
-   **app-merged.yml** - Post-merge cleanup and notifications.

### News & Discord

-   **github-weekly-pr-to-news.yml** - Runs Monday 00:00 UTC. Scans merged PRs, generates `NEWS/{date}.md` PR with `inbox:news` label.
-   **website-weekly-news.yml** - When NEWS PR merges, updates `pollinations.ai/src/config/newsList.js` for the website.
-   **discord-weekly-news.yml** - Triggered when `NEWS/*.md` is pushed. Posts weekly digest to Discord.
-   **discord-pr-merged.yml** - Posts every merged PR to Discord immediately.

### Project Management

-   **github-issue-to-project.yml** - Adds all new issues to Project #20.
-   **close-discarded-issues.yml** - Auto-closes issues marked "Discarded" in project.

### Maintenance

-   **update-github-stars.yml** - Updates star counts for projects.

## Flow Diagrams

### Issue Triage

```
Issue opened on GitHub          Issue from Discord bot
        │                               │
        ▼                               ▼
github-issue-labeler.yml        discord-create-issue.yml
        │                               │
        ▼                               ▼
  inbox:github                    inbox:discord
```

### Weekly News Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  Monday 00:00 UTC (cron)                                        │
│         │                                                       │
│         ▼                                                       │
│  github-weekly-pr-to-news.yml                                   │
│         │                                                       │
│         ▼                                                       │
│  Scans all merged PRs (GraphQL)                                 │
│         │                                                       │
│         ▼                                                       │
│  Creates PR: NEWS/{date}.md + inbox:news label                  │
│         │                                                       │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼ (PR reviewed & merged)
┌─────────────────────────────────────────────────────────────────┐
│  TWO workflows trigger in parallel:                             │
│                                                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐   │
│  │ discord-weekly-news.yml │  │ website-weekly-news.yml     │   │
│  │ (push to NEWS/*.md)     │  │ (PR merged with NEWS/*.md)  │   │
│  │         │               │  │         │                   │   │
│  │         ▼               │  │         ▼                   │   │
│  │ Posts digest to Discord │  │ Creates PR to update        │   │
│  │                         │  │ newsList.js for website     │   │
│  └─────────────────────────┘  └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Live PR Notifications

```
Any PR merged to main
        │
        ▼
discord-pr-merged.yml
        │
        ▼
Posts to Discord immediately
```
