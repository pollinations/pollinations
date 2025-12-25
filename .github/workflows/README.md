# GitHub Workflows

## Documentation

| Document                             | Description                                      |
| ------------------------------------ | ------------------------------------------------ |
| [Labels](docs/LABELS.md)             | Label system reference (inbox, tier, PR labels)  |
| [Tier Upgrade](docs/TIER-UPGRADE.md) | App submissions & contributor tier system        |
| [News & Social](docs/NEWS-SOCIAL.md) | Weekly news, Discord, Instagram pipelines        |
| [Triage](docs/TRIAGE.md)             | Issue/PR labeling, AI agents, project management |
| [Deployment](docs/DEPLOYMENT.md)     | Deploy pipelines (Cloudflare, EC2)               |
| [Maintenance](docs/MAINTENANCE.md)   | Branch cleanup, CI/testing                       |

---

## Naming Convention

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

---

## Authentication

Most workflows use **Polly Bot** (GitHub App) for authentication instead of personal access tokens. This provides:

-   Better security (scoped permissions)
-   Actions appear as bot, not a user
-   No PAT expiration issues

Secrets required: `POLLY_BOT_APP_ID`, `POLLY_BOT_PRIVATE_KEY`
