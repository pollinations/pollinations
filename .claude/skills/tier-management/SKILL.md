---
name: tier-management
description: Evaluate and update Pollinations user tiers. Check balances, upgrade devs, batch process users. For finding users with errors, see model-debugging skill first.
---

# Requirements

Before using this skill, ensure you have:
- **GitHub CLI**: `brew install gh && gh auth login`
- **Node.js/npx**: `brew install node`
- **Wrangler**: `npm install -g wrangler`
- **jq**: `brew install jq` (for parsing JSON)
- **sops**: `brew install sops` (for decrypting secrets)

Must run from the `pollinations` repo root with access to `enter.pollinations.ai/`.

---

# Tier Levels

| Tier | Emoji | Pollen/Day | Criteria |
|------|-------|------------|----------|
| spore | 🍄 | 1 | Default (new signups) |
| seed | 🌱 | 3 | GitHub engagement |
| flower | 🌸 | 10 | Contributed code/project |
| nectar | 🍯 | 20 | Strategic partners |
| router | 🔌 | 100 | Infrastructure partners |

---

# Upgrade Paths

## 🍄 Spore → 🌱 Seed
- ⭐ Starred the pollinations repo
- 💬 Opened an issue or PR
- 💳 Made a purchase

## 🌱 Seed → 🌸 Flower
- 🛠️ Pushed code to pollinations/pollinations
- 📦 Has a project in our showcase
- 🌐 Built something open-source using our API

---

# Evaluate User Tier

## Check for Flower (any ONE qualifies)

**Has commits to pollinations?**
```bash
gh api 'search/commits?q=repo:pollinations/pollinations+author:USERNAME' --jq '.total_count'
```

**Has a project in our lists?**
```bash
grep -ri "author.*USERNAME" pollinations.ai/src/config/projects/
```

## Check for Seed (any ONE qualifies)

**Involved in issues/PRs?**
```bash
gh api 'search/issues?q=repo:pollinations/pollinations+involves:USERNAME' --jq '.total_count'
```

**Starred repo?**
```bash
.claude/skills/tier-management/scripts/fetch-stargazers.sh USERNAME
```

---

# Update User Tier

## How Tiers Work Now

- **Tier balance refills daily** at midnight UTC via Cloudflare cron trigger
- **No rollover** - balance resets to tier amount each day
- **Just update D1** - no external subscription system needed

## Quick Update

### Step 1: Find user
```bash
cd enter.pollinations.ai
npx wrangler d1 execute DB --remote --env production \
  --command "SELECT id, github_username, email, tier, tier_balance FROM user WHERE LOWER(github_username) LIKE '%USERNAME%';"
```

### Step 2: Update tier
```bash
npx wrangler d1 execute DB --remote --env production \
  --command "UPDATE user SET tier='TIER' WHERE github_username='USERNAME';"
```

Balance will update automatically at next midnight UTC refill.

### Step 3 (Optional): Immediate balance update
```bash
# Set balance immediately (e.g., flower = 10 pollen)
npx wrangler d1 execute DB --remote --env production \
  --command "UPDATE user SET tier='flower', tier_balance=10 WHERE github_username='USERNAME';"

## Step 4: Notify user on GitHub
```
🎉 **Tier Upgrade!**

Hey @USERNAME! You've been upgraded to **[EMOJI] [TIER] tier**! ✨

Your benefits:
- [POLLEN] pollen/day (refills daily at midnight UTC)
- 🎨 All standard models

Thanks for being part of pollinations.ai! 🚀
```

---

# Batch Processing

## Find Users with Billing Issues

Use the model-debugging skill to find users hitting 402 errors (billing/quota):

```bash
# Find spore-tier users with >10 402 errors in last 24 hours
.claude/skills/model-debugging/scripts/find-402-users.sh 24 10 spore

# Save to file for batch processing
.claude/skills/model-debugging/scripts/find-402-users.sh 24 10 spore | cut -f1 > /tmp/users.txt
```

> **Note**: 402 = billing issues (pollen balance, key budget). 403 = permission issues (model access denied).

## Check if User is a Developer

```bash
# Check single user
.claude/skills/tier-management/scripts/check-github-dev.sh OliverCWY
# Output: dev: repos=12 followers=13 account_year=2017
```

## Batch Upgrade Devs to Seed

```bash
# Dry run first (no changes)
.claude/skills/tier-management/scripts/upgrade-devs.sh /tmp/users.txt --dry-run

# Apply upgrades
.claude/skills/tier-management/scripts/upgrade-devs.sh /tmp/users.txt
```

The script:
- Checks GitHub profile for dev activity (repos, followers, account age)
- Only upgrades users currently on spore tier (won't downgrade)
- Has 2s delay between GitHub API calls to avoid rate limiting
- Shows summary of upgraded/skipped users

## Check User Balance

```bash
.claude/skills/tier-management/scripts/check-user-balance.sh username_or_email
```

## Legacy Batch Evaluate

```bash
export ENTER_ADMIN_TOKEN=your_token
export TIER_EVAL_GIST_ID=your_gist_id  # optional
.claude/skills/tier-management/scripts/batch-evaluate.sh
```

---

# Key Files

| File | Purpose |
|------|---------|
| `enter.pollinations.ai/src/tier-config.ts` | Tier → pollen mapping (source of truth) |
| `enter.pollinations.ai/src/scheduled.ts` | Cron handler: daily refill |
| `enter.pollinations.ai/src/auth.ts` | Sets tier on new user registration |
| `enter.pollinations.ai/wrangler.toml` | Cron schedule: `0 0 * * *` |

---

# Notes

- **Tier balance resets daily** at midnight UTC (no rollover)
- New users get `spore` tier + 1 pollen immediately
- Tier upgrades take effect on next refill (or set `tier_balance` manually)
