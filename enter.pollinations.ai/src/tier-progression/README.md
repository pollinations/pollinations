# Tier Progression

App-owned orchestration and shared helpers for automated tier changes.

This directory owns progression logic that changes a user's tier based on
GitHub activity, abuse evidence, or other product rules. GitHub Actions may
trigger these flows, but the business logic lives here.

## Ownership

- `enter.pollinations.ai/src/tier-progression/`: implementation and local docs
- `.github/workflows/*.yml`: scheduling and CI entrypoints only
- `.github/docs/OVERVIEW.md`: top-level GitHub automation index

## Layout

- `flows/spore_to_seed.py`: upgrade spore users to seed based on GitHub activity
- `flows/abuse-cohort.ts`: seed one abuse-analysis cohort into the ledger
- `flows/abuse-enrich-llm.ts`: LLM abuse scoring enricher
- `flows/abuse-enrich-purchase.ts`: purchase enricher from `stripe_event`
- `flows/abuse-enrich-usage.ts`: request-count and error-rate enricher
- `flows/abuse-enrich-ip.ts`: IP clustering enricher scoped to the current run
- `flows/abuse-decide.ts`: materialize final downgrade/review actions
- `flows/abuse-apply.ts`: execute explicit downgrade actions against D1
- `shared/abuse-ledger.ts`: shared ledger I/O and Tinybird helpers
- `shared/abuse-d1.ts`: shared D1 execution helper
- `shared/abuse-decide.ts`: pure downgrade decision rules
- `shared/abuse-apply.ts`: pure apply candidate selection
- `shared/tier-update-user.ts`: direct tier updates in D1 (used by app workflows)

## Current Flows

### spore → seed (upgrade)

The upgrade flow is `spore_to_seed.py`.

High-level behavior:

1. Fetch eligible `spore` users from D1, skipping banned users.
2. Prioritize users created in the last 8 hours, then process a rolling slice of older users.
3. Resolve GitHub accounts by immutable `github_id`, not username.
4. Score GitHub activity through `shared/github_profile.py`.
5. Ban users whose GitHub accounts were deleted.
6. Upgrade approved users to `seed`.

This flow is triggered by:

- `.github/workflows/tier-progression-spore-to-seed.yml`

### abuse ledger flow (start with spore)

The abuse pipeline is modular:

```text
cohort
  ├─ enrich-llm
  ├─ enrich-purchase
  ├─ enrich-usage
  └─ enrich-ip
decide
apply
```

The first cohort we use is `tier:spore`, but the structure is cohort-based
rather than spore-specific.

The single source of truth is:

- `src/tier-progression/abuse-ledger.csv`

The ledger is:

- one row per user
- latest state only
- human-inspectable before apply
- sparse by design: enrichers fill columns independently

Key ledger columns:

- identity: `id`, `email`, `github_username`, `tier`, `created_at_ts`
- run scope: `run_id`, `cohort`, `cohort_added_at`
- LLM: `llm_checked_at`, `llm_status`, `llm_score`, `llm_signals`, `llm_action`
- purchase: `purchase_checked_at`, `has_paid_purchase`
- usage: `usage_checked_at`, `request_count`, `error_rate_pct`
- IP: `ip_checked_at`, `ip_hash_peer_ids_in_run`, `subnet_peer_ids_in_run`
- decision: `downgrade_action`, `downgrade_reason`, `decided_at`
- apply: `last_applied_at`
- manual: `manual_action`, `manual_note`

Step behavior:

1. `abuse-cohort.ts` selects a cohort from D1 and seeds the ledger for one run.
2. `abuse-enrich-llm.ts` scores users in overlapping LLM chunks and marks failures as `llm_status=error` instead of pretending they are clean.
3. `abuse-enrich-purchase.ts` checks real Stripe purchases and writes `has_paid_purchase`.
4. `abuse-enrich-usage.ts` fills `request_count` and `error_rate_pct`.
5. `abuse-enrich-ip.ts` computes current-run peer IDs from `ip_hash` and `ip_subnet`, scoped to the first 72h after signup.
6. `abuse-decide.ts` materializes `downgrade_action` only when required enrichers have run.
7. `abuse-apply.ts` applies `downgrade_action=block` with a D1 tier guard.

The current downgrade policy starts with:

- paid purchase → `skip`
- LLM `review` + shared exact IP with flagged unpaid peers → `block`
- LLM `review` + high error rate / request volume → `block`
- LLM `ok` + shared IP/subnet with flagged unpaid peers → `review`

The apply step currently executes:

```sql
UPDATE user
SET tier = 'microbe', tier_balance = 0
WHERE id = ? AND tier = 'spore'
```

That means the effective downgrade is `spore -> microbe`, and `microbe`
ends up with `0` pollen from the apply step.

## Running The Abuse Pipeline

Start a cohort:

```bash
cd enter.pollinations.ai
npx tsx src/tier-progression/flows/abuse-cohort.ts --tier spore --last 24h
```

Run enrichers in any order:

```bash
npx tsx src/tier-progression/flows/abuse-enrich-llm.ts
npx tsx src/tier-progression/flows/abuse-enrich-purchase.ts
npx tsx src/tier-progression/flows/abuse-enrich-usage.ts
npx tsx src/tier-progression/flows/abuse-enrich-ip.ts
```

Materialize the decision and inspect the ledger:

```bash
npx tsx src/tier-progression/flows/abuse-decide.ts
```

Dry-run apply, then apply:

```bash
npx tsx src/tier-progression/flows/abuse-apply.ts --dry-run
npx tsx src/tier-progression/flows/abuse-apply.ts
```

Notes:

- enrichers default to the latest `run_id`
- use `--run-id` to target an older run explicitly
- use `--ledger /absolute/path/to/file.csv` for local fixture testing without touching the default ledger
- `apply` should remain manual
- if `llm_status=error`, rerun the LLM enricher for that run instead of treating the row as clean

## Adding New Progression Flows

When adding a new flow:

1. Put orchestration in `flows/`.
2. Reuse `shared/` helpers instead of duplicating D1 or Tinybird logic.
3. Add or update a workflow in `.github/workflows/` only as the scheduler/entrypoint.
4. Keep implementation notes here instead of recreating a large GitHub-side doc.
