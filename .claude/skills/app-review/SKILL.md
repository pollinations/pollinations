---
name: app-review
description: Review and process app submissions for the Pollinations showcase. Parse issues, validate submissions, create PRs, handle user corrections.
---

# App Review

Two-phase review: automated AI review → human approval → auto-merge PR.

Workflow: `.github/workflows/app-review-submission.yml`

---

## How It Works

1. User opens issue with `TIER-APP` label
2. `app-review` job: validates submission, AI generates emoji + description, bot posts preview comment with `APP_REVIEW_DATA` JSON block
3. Maintainer reviews, adds `TIER-APP-APPROVED` label
4. `app-approve` job: reads JSON from **bot comments only**, creates branch, prepends row to APPS.md, creates auto-merge PR
5. PR merges → `app-handle-outcome` job closes issue with `TIER-APP-COMPLETE`

---

## Common Operations

### Re-trigger AI review (e.g. bot comment missing or stale)

```bash
gh workflow run app-review-submission.yml -f issue_number=ISSUE_NUM -f issue_author=USERNAME
```

This re-runs the AI review and posts a fresh `APP_REVIEW_DATA` comment from the bot.

### Approve an app

Add the `TIER-APP-APPROVED` label to the issue. The approve job reads the bot's `APP_REVIEW_DATA` comment and creates the PR.

**Important:** The approve job only reads comments from the bot (`c.user.type === 'Bot'`). Manually posted JSON won't work — use `workflow_dispatch` to re-trigger.

### Manually post review data (if workflow is broken)

Post a comment **as the bot** with this format:

```markdown
<!-- APP_REVIEW_DATA -->
\```json
{
  "emoji": "🎨",
  "name": "App Name",
  "web_url": "https://...",
  "description": "Short description (~80 chars)",
  "language": "",
  "category": "build",
  "platform": "cli",
  "github_username": "@username",
  "github_user_id": "12345678",
  "repo_url": "https://github.com/...",
  "discord": "discorduser",
  "submitted_date": "2026-01-18",
  "issue_url": "https://github.com/pollinations/pollinations/issues/NNNN"
}
\```
```

### Fix a stuck submission

- `TIER-APP-INCOMPLETE` → User comments or edits issue → re-triggers review
- `TIER-APP-REVIEW` but no bot comment → Re-trigger with `workflow_dispatch` above
- `TIER-APP-APPROVED` but approve failed → Check for bot comment, re-trigger if missing, then re-add label

---

## Label State Machine

```
TIER-APP (new)
  → TIER-APP-REJECTED (validation failed)
  → TIER-APP-INCOMPLETE (not registered)
  → TIER-APP-REVIEW (AI review passed, awaiting human)
    → TIER-APP-APPROVED (human approves → PR created)
      → TIER-APP-COMPLETE (merged, issue closed)
```

---

## Categories

`image`, `video_audio`, `writing`, `chat`, `games`, `learn`, `bots`, `build`, `business`

## Platform values

`web`, `android`, `ios`, `windows`, `macos`, `desktop`, `cli`, `discord`, `telegram`, `whatsapp`, `library`, `browser-ext`, `roblox`, `wordpress`, `api`

---

## Health Checks & Removal

Daily cron (`app-update-metrics.yml`) runs `app-check-links.js --health-update`:
- HTTP checks all app URLs (20 concurrent, 10s timeout)
- Increments Health counter per consecutive failure day
- After **3 consecutive days** broken → opens removal PR
- 401/403/429/451 and known anti-bot hosts treated as alive

### Run locally

```bash
# Health check dry run
node .github/scripts/app-check-links.js --health-update --verbose

# Metrics (needs tokens from enter.pollinations.ai/.testingtokens)
GITHUB_TOKEN=... TINYBIRD_READ_TOKEN=... node .github/scripts/app-update-metrics.js --verbose --dry-run

# Greenhouse (no tokens needed)
node .github/scripts/app-update-greenhouse.js
```
