---
name: tier-management
description: Evaluate and update Pollinations user tiers. Use when asked to check, upgrade, or manage user tiers in enter.pollinations.ai.
---

# Tier Levels

| Tier | Emoji | Pollen/Day | Criteria |
|------|-------|------------|----------|
| spore | 🍄 | 5 | Default (new accounts) |
| seed | 🌱 | 10 | GitHub engagement |
| flower | 🌸 | 15 | Contributed code/project |
| nectar | 🍯 | 20 | Strategic partners |
| router | 🔌 | 100 | Infrastructure partners |

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

## Quick Method (Script)
```bash
.claude/skills/tier-management/scripts/update-tier.sh USERNAME TIER
```
Example: `.claude/skills/tier-management/scripts/update-tier.sh ez-vivek flower`

This handles both DB and Polar updates automatically.

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

```bash
export ENTER_ADMIN_TOKEN=your_token
export TIER_EVAL_GIST_ID=your_gist_id  # optional
.claude/skills/tier-management/scripts/batch-evaluate.sh
```

---

# Notes

- DB tier = what user CAN activate
- Polar subscription = what user HAS activated
- If no Polar subscription, user must click "Activate" at enter.pollinations.ai
