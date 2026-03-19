# User Pipeline Production Rollout

Workflows currently target `staging`. Rollout follows a two-phase approach: dry-run first, then enable live writes.

## Phase 1: Merge with Dry-Run

Switch workflows from `--env staging` to `--env production` with dry-run flags:

```yaml
# hourly — trust scoring (no --store-status = dry)
run: npm run user-pipeline:trust-score -- --env production --parallel 3

# hourly — new-user pipeline
run: npm run user-pipeline:hourly-new-users -- --env production --dry-run

# daily — spore recheck
run: npm run user-pipeline:daily-spore-recheck -- --env production --dry-run
```

**Files to change:**
- `.github/workflows/user-pipeline-hourly-new-users.yml`
- `.github/workflows/user-pipeline-daily-spore-recheck.yml`

Dry mode means: trust-score without `--store-status` does not write scores or ban users; `--dry-run` on the other scripts prints outcomes without changing tiers.

## Phase 2: Follow-Up PR

After validating dry production runs, open a small PR that:
- Adds `--store-status` back to the hourly trust gate
- Removes `--dry-run` from both hourly and daily steps

## Do Not Change

- `trust_score = 0 / 100` bootstrap stays in the migration only
- Manual tools stay under `scripts/user-pipeline/manual/`
- Backfills stay outside steady-state workflows
