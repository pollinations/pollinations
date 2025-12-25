# GitHub Workflows

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

## Label System

### Inbox Labels (Triage)

| Label           | Purpose                          | Applied by                                        |
| --------------- | -------------------------------- | ------------------------------------------------- |
| `inbox:github`  | External issue needs triage      | `issue-label-external.yml`                        |
| `inbox:discord` | Issue created from Discord       | `issue-create-from-discord.yml` (via Discord bot) |
| `inbox:news`    | PR related to weekly news update | `pr-create-weekly-news.yml`                       |

### Tier Labels (Unified for Apps & PRs)

| Label              | Purpose                                         | Applied by                                              |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------- |
| `tier:review`      | No tier/spore/seed, eligible for Flower upgrade | Issue template / `pr-label-external.yml`                |
| `tier:info-needed` | Awaiting registration or more info              | `tier-app-submission.yml` / `tier-upgrade-on-merge.yml` |
| `tier:flower`      | Approved for Flower tier                        | `tier-upgrade-on-merge.yml` (auto on merge)             |
| `tier:done`        | Tier upgrade completed                          | `tier-upgrade-on-merge.yml`                             |

### PR Labels

| Label              | Purpose                                           | Applied by              |
| ------------------ | ------------------------------------------------- | ----------------------- |
| `pr:external`      | Returning external contributor (has flower tier+) | `pr-label-external.yml` |
| `pr:review-needed` | Needs maintainer review                           | Manual                  |
| `pr:merge-ready`   | Approved, ready to merge                          | Manual                  |
| `pr:news`          | PR related to news/social                         | Instagram workflows     |

## Workflows

### AI Agents

-   **pr-issue-assistant.yml** - AI assistant (Polly) via Pollinations AI, triggered by `polly` in issues/PRs. Whitelisted users only.
-   **issue-pr-review-changes.yml** - Claude Opus agent triggered by `@claude` in issues/PRs. Performs code reviews and answers questions.

### Triage

-   **issue-label-external.yml** - Adds `inbox:github` to external issues. Skips if `inbox:discord` or `app:*` labels exist.
-   **pr-label-external.yml** - Checks user tier in D1: flower+ gets `pr:external`, others get `tier:review`. Skips internal users and bots.
-   **pr-assign-author.yml** - Assigns the PR creator to the PR when opened.

### Tier Upgrade System

-   **tier-app-submission.yml** - AI-powered app submission pipeline. Split into 3 jobs:
    -   `tier-parse-issue` - Parse submission with AI, validate, check Enter registration
    -   `tier-create-app-pr` - Fetch stars, AI-format (emoji + description), prepend to `apps/APPS.md`, create PR
    -   `tier-close-issue-on-pr` - Close linked issue when PR is merged/closed
-   **tier-upgrade-on-merge.yml** - When PR with `tier:review` label merges, upgrades labels (`tier:review` → `tier:flower` → `tier:done`) and user to Flower tier in D1 + Polar.
-   **tier-recheck-registration.yml** - When user comments on issue/PR with `tier:info-needed`, re-checks registration.

### News & Discord

-   **pr-create-weekly-news.yml** - Runs Monday 00:00 UTC. Scans merged PRs, creates `NEWS/{date}.md` PR with `inbox:news` label.
-   **pr-create-highlights.yml** - When NEWS PR merges, AI extracts top highlights → creates PR for `NEWS/transformed/highlights.md`.
-   **pr-update-readme.yml** - When highlights PR merges, takes top 10 entries → creates PR to update README's "Latest News" section.
-   **discord-post-weekly-news.yml** - Triggered when `NEWS/*.md` is pushed. Posts weekly digest to Discord.
-   **discord-post-merged-pr.yml** - Posts every merged PR to Discord immediately.

### Instagram

-   **instagram-generate-post.yml** - Daily at 16:00 UTC. Scans recent PRs, generates Instagram post content, creates PR with image and caption.
-   **instagram-publish-post.yml** - When Instagram post PR is merged, publishes to Instagram via API.

### Project Management

-   **issue-add-to-project.yml** - Adds all new issues to Project #20.
-   **pr-add-to-project.yml** - Adds all new PRs to Project #20.
-   **issue-close-discarded.yml** - Auto-closes issues marked "Discarded" in project (hourly).
-   **pr-update-project-status.yml** - Updates PR status in project (In Progress/In Review/Done/Discarded).

### Deployment

-   **app-deploy.yml** - Auto-deploys apps to Cloudflare Pages when `apps/**` changes on `production` branch.
-   **app-deploy-manual.yml** - Manual deployment of specific app to Cloudflare Pages.
-   **deploy-enter-cloudflare.yml** - Deploys `enter.pollinations.ai` to Cloudflare Workers on `production` push.
-   **deploy-enter-services.yml** - Deploys `text.pollinations.ai` and `image.pollinations.ai` to EC2 via SSH. Supports staging and production.
-   **deploy-portkey-gateway.yml** - Deploys Portkey gateway to Cloudflare Workers.

### CI & Testing

-   **backend-run-tests.yml** - Runs backend tests for `text` and `image` services when files change.

### Tier Scripts

-   **.github/scripts/tier-apps-prepend.js** - Prepends a new row to `apps/APPS.md`.
-   **.github/scripts/tier-apps-update-readme.js** - Updates README with last 10 apps from `apps/APPS.md`.
-   **.github/scripts/tier-apps-check-links.js** - Checks all app URLs for broken links. Run with `--report` to generate `apps/BROKEN_APPS.md`.

### Branch Cleanup

-   **branch-delete-stale.yml** - Manual workflow to delete branches older than X days. Protected branches (main, master, production) always excluded.
-   **branch-delete-merged.yml** - Auto-deletes the source branch when a PR is merged. Skips forks and protected branches.

## Flow Diagrams

### Weekly News Pipeline

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart TD
    subgraph CRON["Monday 00:00 UTC"]
        A[pr-create-weekly-news.yml] --> B[Scans merged PRs via GraphQL]
        B --> C[Creates PR: NEWS/date.md]
    end

    C -->|PR reviewed & merged| D[TWO workflows trigger]

    D --> E[discord-post-weekly-news]
    D --> F[pr-create-highlights]

    E --> G[Posts digest to Discord]

    F --> H[AI extracts top highlights]
    H --> I[Creates PR: highlights.md]

    I -->|PR reviewed & merged| J[pr-update-readme]
    J --> K[Takes top 10 highlights]
    K --> L[Creates PR: update README.md]
```

### Instagram Pipeline

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart TD
    subgraph CRON["Daily 16:00 UTC"]
        A[instagram-generate-post.yml] --> B[Scans recent PRs]
        B --> C[AI generates caption + image]
        C --> D[Creates PR with post JSON]
    end

    D -->|PR reviewed & merged| E[instagram-publish-post.yml]
    E --> F[Publishes to Instagram API]
```

### Issue Triage

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart TD
    A[Issue opened on GitHub] --> B[issue-label-external.yml]
    B --> C[inbox:github]

    D[Issue from Discord bot] --> E[issue-create-from-discord.yml]
    E --> F[inbox:discord]
```

### PR Triage

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart TD
    A[PR opened] --> B{Author check}
    B -->|External| C[pr-label-external.yml]
    C --> D{Check D1 tier}
    D -->|flower+| E[pr:external label]
    D -->|seed/none| F[tier:review label]
    B -->|Internal/Bot| G[No label]

    A --> H[pr-assign-author.yml]
    H --> I[Author assigned]

    A --> J[pr-add-to-project.yml]
    J --> K[Added to Project #20]
```

### Branch Cleanup

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart TD
    subgraph AUTO["On PR Merge"]
        A[PR merged] --> B[branch-delete-merged.yml]
        B --> C{Protected?}
        C -->|No| D[Delete source branch]
        C -->|Yes| E[Skip]
    end

    subgraph MANUAL["Manual Trigger"]
        F[Run branch-delete-stale.yml] --> G[Input: X days]
        G --> H[GraphQL: fetch all branches]
        H --> I{Older than X days?}
        I -->|Yes & not protected| J[Delete branch]
        I -->|No or protected| K[Keep branch]
    end
```

### Deployment Pipeline

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart TD
    subgraph APPS["Apps Deployment"]
        A1[Push to production] --> A2{apps/** changed?}
        A2 -->|Yes| A3[app-deploy.yml]
        A3 --> A4[Deploy to Cloudflare Pages]
    end

    subgraph ENTER["Enter Gateway"]
        B1[Push to production] --> B2{enter.pollinations.ai changed?}
        B2 -->|Yes| B3[deploy-enter-cloudflare.yml]
        B3 --> B4[Deploy to Cloudflare Workers]
    end

    subgraph SERVICES["Backend Services"]
        C1[Push to production/staging] --> C2[deploy-enter-services.yml]
        C2 --> C3[SSH to EC2]
        C3 --> C4[Restart systemd services]
        C4 --> C5[Health checks]
    end
```

### AI Assistant (Polly)

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart TD
    A[User mentions 'polly' in issue/PR/comment] --> B{User whitelisted?}
    B -->|No| C[Posts unauthorized message]
    B -->|Yes| D[pr-issue-assistant.yml]
    D --> E[Starts Pollinations AI router]
    E --> F[Claude Code Action responds]
    F --> G[AI assists with code/questions]
```

### Live PR Notifications

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart TD
    A[Any PR merged to main] --> B[discord-post-merged-pr.yml]
    B --> C[Posts to Discord immediately]
```

### Tier Upgrade Flow

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
