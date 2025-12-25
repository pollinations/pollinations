# Tier Upgrade System

## Issue Template

The app submission process starts with the issue template at `.github/ISSUE_TEMPLATE/tier-app-submission.yml`:

-   **Form fields**: App name, description, URL, GitHub repo, Discord, category, language
-   **Categories**: Chat 💬, Creative 🎨, Games 🎲, Hack & Build 🛠️, Learn 📚, Social Bots 🤖, Vibe Coding ✨
-   **Auto-label**: `tier:review` applied on creation

## Workflows

-   **tier-app-submission.yml** - AI-powered app submission pipeline. Split into 3 jobs:
    -   `tier-parse-issue` - Parse submission with AI, validate, check Enter registration
    -   `tier-create-app-pr` - Fetch stars, AI-format (emoji + description), prepend to `apps/APPS.md`, create PR
    -   `tier-close-issue-on-pr` - Close linked issue when PR is merged/closed
-   **tier-upgrade-on-merge.yml** - When PR with `tier:review` label merges, upgrades labels (`tier:review` → `tier:flower` → `tier:done`) and user to Flower tier in D1 + Polar.
-   **tier-recheck-registration.yml** - When user comments on issue/PR with `tier:info-needed`, re-checks registration.

## Scripts

### tier-apps-prepend.js

Prepends a new app entry to `apps/APPS.md`.

```bash
NEW_ROW="| 🎨 | [App Name](url) | Description | en | creative | @user | repo | ⭐10 | | | 2025-01-01 |" \
  node .github/scripts/tier-apps-prepend.js
```

### tier-apps-update-readme.js

Updates root README with the last 10 apps from `apps/APPS.md`.

```bash
node .github/scripts/tier-apps-update-readme.js
```

### tier-apps-check-links.js

Checks all app URLs for broken links.

```bash
# Basic check
node .github/scripts/tier-apps-check-links.js

# Options
--timeout=<ms>     # Set timeout (default: 10000)
--category=<name>  # Check only specific category
--verbose          # Show detailed output
--update           # Add ❌ to broken apps in APPS.md
--report           # Generate apps/BROKEN_APPS.md
```

## Tier Hierarchy

| Tier   | Level | Description                      |
| ------ | ----- | -------------------------------- |
| None   | 0     | Not registered                   |
| Spore  | 1     | First tier                       |
| Seed   | 2     | Second tier                      |
| Flower | 3     | Contributor tier (10 pollen/day) |
| Nectar | 4     | Higher tier                      |

## Flow Diagram

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart TD
    subgraph APP["App Submission"]
        A1[User opens issue] --> A2[tier:review label]
        A2 --> A3[tier-app-submission.yml]
        A3 --> A4{Registered?}
        A4 -->|No| A5[tier:info-needed + comment]
        A5 --> A6[User comments]
        A6 --> A7[tier-recheck-registration.yml]
        A7 --> A4
        A4 -->|Yes| A8[Fetch stars + AI format]
        A8 --> A9[Prepend to apps/APPS.md]
        A9 --> A10[Create PR automatically]
    end

    subgraph PR["Direct PR"]
        B1[User opens PR] --> B2[pr-label-external.yml]
        B2 --> B3{Check D1 tier}
        B3 -->|flower+| B4[pr:external]
        B3 -->|seed/none| B5[tier:review]
    end

    A10 --> C[Maintainer reviews]
    B5 --> C

    C --> D{Approve?}
    D -->|Yes| E[Merge PR]
    D -->|No| F[Close without merge]

    E --> G[tier-upgrade-on-merge.yml]
    G --> G1[tier:review → tier:flower]
    G1 --> I{User registered?}
    I -->|Yes| J[Upgrade D1 + Polar]
    J --> K[tier:done + celebration comment]
    I -->|No| L[tier:info-needed + reminder]
```
