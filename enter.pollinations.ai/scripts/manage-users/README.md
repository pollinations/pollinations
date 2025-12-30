# Manage Users (D1 ↔ Polar)

Sync D1 users with Polar subscriptions. D1 is the source of truth.

## Quick Start

```bash
cd enter.pollinations.ai

# 1. Fetch Polar data
POLAR_ACCESS_TOKEN=token npx tsx scripts/manage-users/fetch-polar-data.ts

# 2. Compare D1 with Polar
npx tsx scripts/manage-users/compare-d1-polar-users.ts

# 3. Fix issues (with dry run first)
POLAR_ACCESS_TOKEN=token npx tsx scripts/manage-users/fix-polar-missing-subscription.ts --dry-run
POLAR_ACCESS_TOKEN=token npx tsx scripts/manage-users/fix-polar-missing-subscription.ts
```

## Scripts

| Script                                | Purpose                                           |
| ------------------------------------- | ------------------------------------------------- |
| `fetch-polar-data.ts`                 | Fetch all Polar subscriptions to local JSON       |
| `compare-d1-polar-users.ts`           | Compare D1 users with Polar, generate issue files |
| `fix-polar-missing-subscription.ts`   | Create missing Polar subscriptions                |
| `fix-polar-tier-mismatch.ts`          | Update Polar subscriptions to match D1 tier       |
| `fix-polar-duplicate-subscription.ts` | Remove duplicate Polar subscriptions              |

## Issue Types

| Issue                          | Description                                | Fix Script                            |
| ------------------------------ | ------------------------------------------ | ------------------------------------- |
| `polar-subscription-missing`   | D1 user has tier but no Polar subscription | `fix-polar-missing-subscription.ts`   |
| `polar-tier-mismatch`          | Polar subscription has wrong tier          | `fix-polar-tier-mismatch.ts`          |
| `polar-duplicate-subscription` | User has multiple Polar subscriptions      | `fix-polar-duplicate-subscription.ts` |
| `d1-user-missing`              | Polar subscription exists but no D1 user   | Manual investigation                  |
| `d1-tier-missing`              | D1 user exists but has no valid tier       | Manual investigation                  |

## Output Files

After running `compare-d1-polar-users.ts`, issue files are created in `data/`:

- `overview.json` - Summary of all issues
- `polar-subscription-missing.json` - Users needing Polar subscriptions
- `polar-tier-mismatch.json` - Users with wrong tier in Polar
- `polar-duplicate-subscription.json` - Users with duplicate subscriptions
- `d1-user-missing.json` - Polar users not in D1
- `d1-tier-missing.json` - D1 users without valid tier

Files are only created if there are issues of that type.

## Dry Run Mode

Fix scripts support `--dry-run` to preview changes without making them:

```bash
npx tsx scripts/manage-users/fix-polar-missing-subscription.ts --dry-run
```

## Requirements

- `POLAR_ACCESS_TOKEN` environment variable for Polar API access
- D1 database access via wrangler
