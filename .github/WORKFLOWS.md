# GitHub Workflows

## Label System

### Inbox Labels (Triage)

| Label           | Purpose                          | Applied by                           |
| --------------- | -------------------------------- | ------------------------------------ |
| `inbox:github`  | External issue needs triage      | `inbox-github-labeler.yml`           |
| `inbox:discord` | Issue created from Discord       | `create-issue.yml` (via Discord bot) |
| `inbox:news`    | PR related to weekly news update | `weekly_digest.yml`                  |

### App Submission Labels

| Label             | Purpose                       | Applied by       |
| ----------------- | ----------------------------- | ---------------- |
| `app:review`      | App submission pending review | Issue template   |
| `app:info-needed` | Awaiting submitter response   | `app-review.yml` |
| `app:approved`    | App merged to showcase        | `app-merged.yml` |
| `app:denied`      | Submission rejected           | Manual           |

## Workflows

### Triage

-   **inbox-github-labeler.yml** - Adds `inbox:github` to external issues. Skips if `inbox:discord` or `app:*` labels exist.
-   **create-issue.yml** - Creates GitHub issues from Discord bot via `repository_dispatch`.

### App Submissions

-   **app-review.yml** - AI-powered review of app submissions. Parses issue, creates PR to add project.
-   **app-merged.yml** - Post-merge cleanup and notifications.

### News & Discord

-   **weekly_digest.yml** - Runs Monday 00:00 UTC. Scans merged PRs, generates `NEWS.md` update PR with `inbox:news` label.
-   **discord_post.yml** - Triggered when `NEWS.md` is pushed. Posts weekly digest to Discord.
-   **pr-review-discord.yml** - Posts every merged PR to Discord immediately.

### Maintenance

-   **close-discarded-issues.yml** - Auto-closes stale issues.
-   **update-github-stars.yml** - Updates star counts for projects.

## Flow Diagrams

### Issue Triage

```
Issue opened on GitHub          Issue from Discord bot
        │                               │
        ▼                               ▼
inbox-github-labeler.yml        create-issue.yml
        │                               │
        ▼                               ▼
  inbox:github                    inbox:discord
```

### Weekly News

```
Monday 00:00 UTC
        │
        ▼
weekly_digest.yml (scans PRs)
        │
        ▼
Creates PR with NEWS.md + inbox:news label
        │
        ▼ (PR merged)
discord_post.yml
        │
        ▼
Posts digest to Discord
```
