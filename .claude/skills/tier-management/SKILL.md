---
name: tier-management
description: Look up a Pollinations user's Pollen balance and tier (read-only). Tiers are frozen — there are no automatic or manual tier upgrades. For finding users with errors, see model-debugging skill first.
---

# Requirements

Before using this skill, ensure you have:
- **Node.js/npx**: `brew install node`
- **Wrangler**: `npm install -g wrangler`
- **jq**: `brew install jq` (for parsing JSON)

Must run from the `pollinations` repo root with access to `enter.pollinations.ai/`.

---

# Tiers are frozen

Tiers (`microbe` / `spore` / `seed` / `flower` / `nectar`) are static account-classification values. Nothing upgrades or downgrades a user's tier — the automatic Spore→Seed, app→Flower, and admin tier-update paths have been removed. Pollen is earned through **Quests**.

This skill is **read-only**: it looks up a user's tier and balance. It does not change tiers.

> How the Quest Pollen balance (the `tier_balance` column) is funded is out of scope here.

---

# Check a user's balance and tier

```bash
.claude/skills/tier-management/scripts/check-user-balance.sh <username_or_email>
```

Prints the user's id, GitHub username, email, tier, tier balance, and account creation date — read straight from production D1.

Or query D1 directly:

```bash
cd enter.pollinations.ai
npx wrangler d1 execute DB --remote --env production \
  --command "SELECT id, github_username, email, tier, tier_balance FROM user WHERE LOWER(github_username) LIKE '%USERNAME%';"
```

---

# Find users with billing issues

Use the model-debugging skill to find users hitting 402 errors (billing/quota):

```bash
.claude/skills/model-debugging/scripts/find-402-users.sh 24 10 spore
```

> 402 = billing issues (Pollen balance, key budget). 403 = permission issues (model access denied).

---

## Key files

| File | Purpose |
|------|---------|
| `shared/tier-config.ts` | Tier → pollen mapping (source of truth) |
