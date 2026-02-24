# GitHub Automation Overview

## Documentation Index

| Document                            | Description                                      |
| ----------------------------------- | ------------------------------------------------ |
| [Labels](LABELS.md)                 | Label system reference (inbox, tier, PR labels)  |
| [Tier System](TIER-SYSTEM.md)       | Tier upgrades, app submission & Flower tier      |
| [Triage](TRIAGE.md)                 | Issue/PR labeling, AI agents, project management |
| [Deployment](DEPLOYMENT.md)         | Deploy pipelines (Cloudflare, EC2)               |
| [Maintenance](MAINTENANCE.md)       | Branch cleanup, CI/testing                       |

---

## Naming Conventions

### Workflows

**Pattern: `ENTITY-ACTION-WHAT`**

| Part       | Description              | Examples                                                  |
| ---------- | ------------------------ | --------------------------------------------------------- |
| **Entity** | What is being acted upon | `issue`, `pr`, `website`, `app`, `branch`                 |
| **Action** | The verb/operation       | `create`, `post`, `generate`, `update`, `review`, `label` |
| **What**   | The target/result        | `weekly-news`, `merged-pr`, `external`, `code`            |

**Examples:**

- `issue-label-external` → Issue / label / external
- `branch-delete-stale` → Branch / delete / stale
- `app-deploy` → App / deploy

**Entity = Effect** (what is affected/created, not what triggers it).

### Scripts

Scripts follow a similar pattern:

| Pattern                 | Examples                                                |
| ----------------------- | ------------------------------------------------------- |
| `entity_action_what.py` | `app_check_duplicate.py`, `app_prepend_row.py`          |
| `app-action-what.js`    | `app-prepend-row.js`, `app-check-links.js`              |

---

## Authentication

Most workflows use **Polly Bot** (GitHub App) for authentication instead of personal access tokens.

**Benefits:**

- Better security (scoped permissions)
- Actions appear as bot, not a user
- No PAT expiration issues

---

## Environment Variables

| Secret                  | Purpose                | Used by           |
| ----------------------- | ---------------------- | ----------------- |
| `POLLY_BOT_APP_ID`      | GitHub App ID          | Most workflows    |
| `POLLY_BOT_PRIVATE_KEY` | GitHub App private key | Most workflows    |
| `GITHUB_TOKEN`          | GitHub API access      | Scripts           |
| `CLOUDFLARE_*`          | Cloudflare deployment  | Deploy workflows  |

> **Note:** Social media secrets (Discord, Instagram, Buffer) are documented in `social/README.md`

---

## Directory Structure

```
.github/
├── docs/               # This documentation
├── scripts/            # Python/JS scripts called by workflows
├── workflows/          # GitHub Actions YAML files
└── ISSUE_TEMPLATE/     # Issue templates
```
