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

> ⚠️ **IMPORTANT**: You MUST update BOTH the database AND Polar subscription. 
> The DB tier controls what tier the user CAN activate. The Polar subscription is what they HAVE activated.

## Recommended: Use the Script

```bash
.claude/skills/tier-management/scripts/update-tier.sh USERNAME TIER
```

**Example:**
```bash
.claude/skills/tier-management/scripts/update-tier.sh s0974092 flower
```

This script automatically:
1. Finds the user by username or email
2. Updates the database tier
3. Updates the Polar subscription (via sops for auth)
4. Verifies the change

## Manual Method

### Step 1: Find user
```bash
cd enter.pollinations.ai
npx wrangler d1 execute DB --remote --env production \
  --command "SELECT id, github_username, email, tier FROM user WHERE LOWER(github_username) LIKE '%USERNAME%';"
```

### Step 2: Update database
```bash
npx wrangler d1 execute DB --remote --env production \
  --command "UPDATE user SET tier='TIER' WHERE github_username='USERNAME';"
```

### Step 3: Update Polar subscription
```bash
export POLAR_ACCESS_TOKEN=$(sops -d secrets/prod.vars.json | grep POLAR_ACCESS_TOKEN | cut -d'"' -f4)
npx tsx scripts/manage-polar.ts user update-tier --email USER_EMAIL --tier TIER
```

Add `--dryRun` to preview changes without applying.

## Step 4: Notify user on GitHub
```
🎉 **Tier Upgrade Complete!**

Hey @USERNAME! You've been upgraded to **[EMOJI] [TIER] tier**! ✨

Your benefits:
- [POLLEN] pollen/day
- ⚡ Priority queue
- 🎨 All standard models

Thanks for being part of Pollinations! 🚀
```

---

# Batch Processing

## Find Users with Quota Issues

Use the model-debugging skill to find users hitting 403 errors:

```bash
# Find spore-tier users with >10 403 errors in last 24 hours
.claude/skills/model-debugging/scripts/find-403-users.sh 24 10 spore

# Save to file for batch processing
.claude/skills/model-debugging/scripts/find-403-users.sh 24 10 spore | cut -f1 > /tmp/users.txt
```

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

# Polar Product IDs (Production)

| Tier | Product ID |
|------|------------|
| Spore | `01a31c1a-7af7-4958-9b73-c10e2fac5f70` |
| Seed | `fe32ee28-c7c4-4e7a-87fa-6ffc062e3658` |
| Flower | `dfb4c4f6-2004-4205-a358-b1f7bb3b310e` |
| Nectar | `066f91a4-8ed1-4329-b5f7-3f71e992ed28` |
| Router | `0286ea62-540f-4b19-954f-b8edb9095c43` |

---

# Notes

- DB tier = what user CAN activate
- Polar subscription = what user HAS activated
- If no Polar subscription, user must click "Activate" at enter.pollinations.ai
