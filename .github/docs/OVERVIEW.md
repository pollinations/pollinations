# GitHub Automation Overview

## Documentation Index

| Document                        | Description                                      |
| ------------------------------- | ------------------------------------------------ |
| [Labels](LABELS.md)             | Label system reference (inbox, tier, PR labels)  |
| [Tier Upgrade](TIER-UPGRADE.md) | App submissions & contributor tier system        |
| [News & Social](NEWS-SOCIAL.md) | Weekly news, Discord, Instagram, Reddit          |
| [Triage](TRIAGE.md)             | Issue/PR labeling, AI agents, project management |
| [Deployment](DEPLOYMENT.md)     | Deploy pipelines (Cloudflare, EC2)               |
| [Maintenance](MAINTENANCE.md)   | Branch cleanup, CI/testing                       |

---

## Naming Conventions

### Workflows

**Pattern: `ENTITY-ACTION-WHAT`**

| Part       | Description              | Examples                                                  |
| ---------- | ------------------------ | --------------------------------------------------------- |
| **Entity** | What is being acted upon | `issue`, `pr`, `discord`, `website`, `app`, `branch`      |
| **Action** | The verb/operation       | `create`, `post`, `generate`, `update`, `review`, `label` |
| **What**   | The target/result        | `weekly-news`, `merged-pr`, `external`, `code`            |

**Examples:**

-   `discord-post-merged-pr` → Discord / post / merged PR
-   `issue-label-external` → Issue / label / external
-   `pr-create-weekly-news` → PR / create / weekly news
-   `branch-delete-stale` → Branch / delete / stale

**Entity = Effect** (what is affected/created, not what triggers it).

### Scripts

Scripts follow a similar pattern but with underscores:

| Pattern                 | Examples                                                |
| ----------------------- | ------------------------------------------------------- |
| `entity_action_what.py` | `discord_post_merged_pr.py`, `pr_create_weekly_news.py` |
| `tier-apps-action.js`   | `tier-apps-prepend.js`, `tier-apps-check-links.js`      |

---

## Authentication

Most workflows use **Polly Bot** (GitHub App) for authentication instead of personal access tokens.

**Benefits:**

-   Better security (scoped permissions)
-   Actions appear as bot, not a user
-   No PAT expiration issues

---

## Environment Variables

| Secret                  | Purpose                | Used by           |
| ----------------------- | ---------------------- | ----------------- |
| `POLLY_BOT_APP_ID`      | GitHub App ID          | Most workflows    |
| `POLLY_BOT_PRIVATE_KEY` | GitHub App private key | Most workflows    |
| `GITHUB_TOKEN`          | GitHub API access      | Scripts           |
| `DISCORD_WEBHOOK_URL`   | Discord posting        | Discord scripts   |
| `INSTAGRAM_*`           | Instagram Graph API    | Instagram scripts |
| `CLOUDFLARE_*`          | Cloudflare deployment  | Deploy workflows  |

---

## Directory Structure

```
.github/
├── docs/               # This documentation
├── scripts/            # Python/JS scripts called by workflows
│   └── reddit_workflow/  # Devvit Reddit bot (self-hosted)
├── workflows/          # GitHub Actions YAML files
└── ISSUE_TEMPLATE/     # Issue templates
```
