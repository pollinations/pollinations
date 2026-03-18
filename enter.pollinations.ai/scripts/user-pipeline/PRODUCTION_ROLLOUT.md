# User Pipeline Production Rollout

This note describes the final productionization step for the user pipeline on `feat/microbe-first-tier`.

The current branch stays staging-only until the last pre-merge commit.

## Rollout Shape

1. Keep the branch staging-locked while validating behavior.
2. Make one final pre-merge productionization commit.
3. Merge that commit.
4. Let the first production workflow runs be dry.
5. Open a small follow-up PR that removes dry mode and enables live writes.

The intended steady-state workflow order is:

1. hourly onboarding
2. daily global abuse scan
3. daily spore recheck

## Final Pre-Merge Commit

The last pre-merge commit should do only two things:

1. Switch the steady-state workflows from `staging` to `production`.
2. Remove the staging-only runtime guards so production is allowed.

### Files To Change

- `/Users/comsom/Github/pollinations/.github/workflows/user-pipeline-hourly-new-users.yml`
- `/Users/comsom/Github/pollinations/.github/workflows/user-pipeline-daily-global-abuse-scan.yml`
- `/Users/comsom/Github/pollinations/.github/workflows/user-pipeline-daily-spore-recheck.yml`
- `/Users/comsom/Github/pollinations/enter.pollinations.ai/scripts/user-pipeline/scoring/trust-score.ts`
- `/Users/comsom/Github/pollinations/enter.pollinations.ai/scripts/user-pipeline/daily-global-abuse-scan.ts`
- `/Users/comsom/Github/pollinations/enter.pollinations.ai/scripts/user-pipeline/hourly-new-users.ts`
- `/Users/comsom/Github/pollinations/enter.pollinations.ai/scripts/user-pipeline/daily-spore-recheck.py`
- `/Users/comsom/Github/pollinations/enter.pollinations.ai/scripts/user-pipeline/shared/d1.py`

## First Post-Merge Run Must Be Dry

The first production runs after merge should not write to production.

### Hourly Workflow

In `/Users/comsom/Github/pollinations/.github/workflows/user-pipeline-hourly-new-users.yml`:

- Change `--env staging` to `--env production`
- Keep the trust gate dry by removing `--store-status`
- Keep the hourly tier step dry by adding `--dry-run`

Target commands for the first merged run:

```yaml
run: npm run user-pipeline:trust-score -- --env production --parallel 3
```

```yaml
run: npm run user-pipeline:hourly-new-users -- --env production --dry-run
```

### Daily Global Abuse Workflow

In `/Users/comsom/Github/pollinations/.github/workflows/user-pipeline-daily-global-abuse-scan.yml`:

- Change `--env staging` to `--env production`
- Add `--dry-run`

Target command for the first merged run:

```yaml
run: npm run user-pipeline:daily-global-abuse-scan -- --env production --dry-run
```

### Daily Workflow

In `/Users/comsom/Github/pollinations/.github/workflows/user-pipeline-daily-spore-recheck.yml`:

- Change `--env staging` to `--env production`
- Add `--dry-run`

Target command for the first merged run:

```yaml
run: npm run user-pipeline:daily-spore-recheck -- --env production --dry-run
```

## What Dry Mode Means

- `trust-score.ts` without `--store-status` does not write `trust_score` and does not ban users.
- `hourly-new-users.ts --dry-run` prints would-be `microbe -> spore/seed` outcomes without changing tiers.
- `daily-global-abuse-scan.ts --dry-run` prints would-be trust updates and `spore+ -> microbe` downgrades without changing users.
- `daily-spore-recheck.py --dry-run` prints would-be `spore -> seed` outcomes without changing tiers or scores.

So the first merged production runs are safe observation runs.

## Follow-Up PR After Dry Validation

Once the dry production runs look correct, open a very small follow-up PR that removes dry mode:

- add `--store-status` back to the hourly trust gate
- remove `--dry-run` from the hourly new-user step
- remove `--dry-run` from the daily global abuse scan step
- remove `--dry-run` from the daily spore recheck step

That PR should not include refactors. It should only turn on live writes.

## Do Not Change

- Keep the `trust_score = 0 / 100` bootstrap in the migration only.
- Keep manual tools under `scripts/user-pipeline/manual/`.
- Keep backfills outside steady-state workflows.
