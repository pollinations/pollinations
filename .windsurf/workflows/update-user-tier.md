---
description: Update a user's tier (DB + Polar subscription)
---

# Update User Tier

> **Note**: For Claude users, prefer the `tier-management` skill at `.claude/skills/tier-management/SKILL.md`

## Prerequisites
- Must be in `enter.pollinations.ai` directory
- Need access to sops for decrypting secrets

## Steps

### 1. Check user's current tier
```bash
cd enter.pollinations.ai
npx wrangler d1 execute DB --remote --env production \
  --command "SELECT github_username, email, tier FROM user WHERE LOWER(github_username) LIKE '%USERNAME%' OR LOWER(email) LIKE '%EMAIL%';"
```

### 2. Update DB tier
// turbo
```bash
npx wrangler d1 execute DB --remote --env production \
  --command "UPDATE user SET tier='TIER' WHERE github_username='USERNAME';"
```

Valid tiers: `spore`, `seed`, `flower`, `nectar`, `router`

### 3. Update Polar subscription (if user has one)
// turbo
```bash
export POLAR_ACCESS_TOKEN=$(sops -d secrets/prod.vars.json | grep POLAR_ACCESS_TOKEN | cut -d'"' -f4)
npx tsx scripts/manage-polar.ts user update-tier --email USER_EMAIL --tier TIER
```

Or use the one-liner script:
```bash
export POLAR_ACCESS_TOKEN=$(sops -d secrets/prod.vars.json | grep POLAR_ACCESS_TOKEN | cut -d'"' -f4)
npx tsx scripts/manage-polar.ts user update-tier --email USER@EMAIL.COM --tier flower
```

### 4. Verify the change
```bash
npx wrangler d1 execute DB --remote --env production \
  --command "SELECT github_username, tier FROM user WHERE github_username='USERNAME';"
```

## Tier Product IDs (Production)
| Tier | Product ID |
|------|------------|
| Spore | `01a31c1a-7af7-4958-9b73-c10e2fac5f70` |
| Seed | `fe32ee28-c7c4-4e7a-87fa-6ffc062e3658` |
| Flower | `dfb4c4f6-2004-4205-a358-b1f7bb3b310e` |
| Nectar | `066f91a4-8ed1-4329-b5f7-3f71e992ed28` |
| Router | `0286ea62-540f-4b19-954f-b8edb9095c43` |

## Notes
- If user has no Polar subscription, they need to click "Activate" in enter.pollinations.ai dashboard
- The `user update-tier` script automatically handles proration for immediate changes
- DB tier determines what tier the user CAN activate; Polar subscription is what they HAVE activated
