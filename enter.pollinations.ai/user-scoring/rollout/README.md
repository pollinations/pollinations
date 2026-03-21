# User Scoring Production Rollout

This note describes the final productionization step for the user-scoring subsystem on `feat/microbe-first-tier`.

The current branch stays staging-only until the last pre-merge commit.

That staging lock applies to steady-state workflows and manual pipeline tools:

- orchestrators default to `staging`
- audit and rollout helpers default to `staging`
- production use should always be explicit with `--env production`

## Rollout Shape

1. Keep the branch staging-locked while validating behavior.
2. Make one final pre-merge productionization commit.
3. Merge that commit.
4. Let the first production workflow runs be dry.
5. Open a small follow-up PR that removes dry mode and enables live writes.

The implemented steady-state workflow order on this branch is:

1. hourly onboarding
2. daily spore recheck

The daily global abuse scan is planned follow-up work. It is not implemented on this branch and is not part of the current rollout.

## Existing-User Bootstrap

The source of truth for the initial trust bootstrap is the migration
[`drizzle/0017_add_score_and_trust_score.sql`](../../drizzle/0017_add_score_and_trust_score.sql):

- existing `microbe` users -> `trust_score = 0`
- existing `spore/seed/flower/nectar/router` users -> `trust_score = 100`

This should happen through the normal production migration path, not by a steady-state job.

The helper script
[`bootstrap-trust-scores.ts`](./bootstrap-trust-scores.ts)
exists only as a rollout/repair tool for rows that still have `trust_score IS NULL`.

Recommended verification before any repair write:

```bash
npm run user-pipeline:rollout-bootstrap-trust -- --env production
```

Only use `--apply` if production still has null trust rows after migration.

## One-Time Score Coverage Helpers

The rollout helper
[`fill-spore-github-scores.ts`](./fill-spore-github-scores.ts)
fills missing `score` and `score_checked_at` for existing `spore` users.

Important behavior:

- safe by default: dry-run unless `--apply` is passed
- writes `score` and `score_checked_at` only
- does not promote or downgrade tiers directly
- deleted/invalid GitHub accounts are only banned when `--ban-deleted` is passed

Recommended first pass:

```bash
npm run user-pipeline:rollout-fill-spore-scores -- --env production
```

If you choose to use it live later:

```bash
npm run user-pipeline:rollout-fill-spore-scores -- --env production --apply
```

Use `--ban-deleted` only if you explicitly want the rollout helper to ban deleted accounts during that pass.

## Final Pre-Merge Commit

The last pre-merge commit should do only two things:

1. Switch the steady-state workflows from `staging` to `production`.
2. Remove the staging-only runtime guards so production is allowed.

### Files To Change

- `.github/workflows/user-pipeline-hourly-new-users.yml`
- `.github/workflows/user-pipeline-daily-spore-recheck.yml`
- `enter.pollinations.ai/user-scoring/jobs/audit-github-accounts.ts`
- `enter.pollinations.ai/user-scoring/scoring/trust-score.ts`
- `enter.pollinations.ai/user-scoring/jobs/hourly-new-users.ts`
- `enter.pollinations.ai/user-scoring/jobs/daily-spore-recheck.ts`

## First Post-Merge Run Must Be Dry

The first production runs after merge should not write to production.

### Hourly Workflow

In `.github/workflows/user-pipeline-hourly-new-users.yml`:

- Change `--env staging` to `--env production`
- Keep the trust gate dry by removing `--store-status`
- Keep the hourly tier step dry by adding `--dry-run`

Trust-gate note for the first merged run:

- This branch keeps `trust-score.ts` staging-only.
- Do not cargo-cult an unsupported `--env production` or `--parallel` flag into the workflow.
- Make the productionization change for `trust-score.ts` explicitly in the final pre-merge checklist, then update the workflow command in the same commit.

```yaml
run: npm run user-pipeline:hourly-new-users -- --env production --dry-run
```

### Daily Workflow

In `.github/workflows/user-pipeline-daily-spore-recheck.yml`:

- Change `--env staging` to `--env production`
- Add `--dry-run`

Target command for the first merged run:

```yaml
run: npm run user-pipeline:daily-spore-recheck -- --env production --dry-run
```

## What Dry Mode Means

- `trust-score.ts` without `--store-status` does not write `trust_score` and does not ban users.
- `hourly-new-users.ts --dry-run` prints would-be `microbe -> spore/seed` outcomes without changing tiers.
- `daily-spore-recheck.ts --dry-run` prints would-be `spore -> seed` outcomes without changing tiers or scores.

So the first merged production runs are safe observation runs.

## Follow-Up PR After Dry Validation

Once the dry production runs look correct, open a very small follow-up PR that removes dry mode:

- add `--store-status` back to the hourly trust gate
- remove `--dry-run` from the hourly new-user step
- remove `--dry-run` from the daily spore recheck step

That PR should not include refactors. It should only turn on live writes.

## Staging After Merge

Staging is not part of the production rollout itself.

After production is migrated and the new system is live, the recommended staging refresh is:

1. reseed staging from production using
   [`seed-staging.mjs`](../test/seed-staging.mjs)
2. rebuild cohort files with
   [`cohort-setup.ts`](../test/cohort-setup.ts)
3. use [`TESTING.md`](../test/TESTING.md) for routine validation

Routine staging tests should rely on `reset-cohort.ts`, not on rollout helpers.

## Analytics Note

Tinybird `d1_user.datasource` keeps `github_id` as `Int64`.

This avoids overflow once GitHub user IDs grow past signed 32-bit range.

## Do Not Change

- Keep the `trust_score = 0 / 100` bootstrap in the migration only.
- Keep rollout helpers separate from the steady-state workflows under `user-scoring/rollout/`.
