# GitHub Workflows

## Label System

### Inbox Labels (Triage)

| Label           | Purpose                          | Applied by                                   |
| --------------- | -------------------------------- | -------------------------------------------- |
| `inbox:github`  | External issue needs triage      | `github-issue-labeler.yml`                   |
| `inbox:discord` | Issue created from Discord       | `discord-create-issue.yml` (via Discord bot) |
| `inbox:news`    | PR related to weekly news update | `news-weekly-generate.yml`                   |

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

-   **news-weekly-generate.yml** - Runs Monday 00:00 UTC. Scans merged PRs, generates `NEWS.md` update PR with `inbox:news` label.
-   **discord-weekly-news.yml** - Triggered when `NEWS.md` is pushed. Posts weekly digest to Discord.
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

### Weekly News

```
Monday 00:00 UTC
        │
        ▼
news-weekly-generate.yml (scans PRs)
        │
        ▼
Creates PR with NEWS.md + inbox:news label
        │
        ▼ (PR merged)
discord-weekly-news.yml
        │
        ▼
Posts digest to Discord
```
