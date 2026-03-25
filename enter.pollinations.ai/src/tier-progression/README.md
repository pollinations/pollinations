# Tier Progression

App-owned orchestration and shared helpers for automated tier changes.

This directory owns progression logic that changes a user's tier based on
GitHub activity or other product rules. GitHub Actions workflows may trigger
these flows, but the business logic lives here.

## Ownership

- `enter.pollinations.ai/src/tier-progression/`: implementation and local docs
- `.github/workflows/*.yml`: scheduling and CI entrypoints only
- `.github/docs/OVERVIEW.md`: top-level GitHub automation index

## Layout

- `flows/`: concrete progression flows such as `spore_to_seed.py`
- `shared/github_profile.py`: GitHub identity lookup and scoring logic
- `shared/d1_updates.py`: shared D1 query and mutation helpers

## Current Flow

The current scheduled flow is `spore_to_seed.py`.

High-level behavior:

1. Fetch eligible `spore` users from D1, skipping banned users.
2. Prioritize users created in the last 8 hours, then process a rolling slice of older users.
3. Resolve GitHub accounts by immutable `github_id`, not username.
4. Score GitHub activity through `shared/github_profile.py`.
5. Ban users whose GitHub accounts were deleted.
6. Upgrade approved users to `seed`.

This flow is triggered by:

- `.github/workflows/tier-progression-spore-to-seed.yml`

## Entry Point

Run the current flow locally from the repo root:

```bash
python enter.pollinations.ai/src/tier-progression/flows/spore_to_seed.py --dry-run
```

Useful variants:

```bash
python enter.pollinations.ai/src/tier-progression/flows/spore_to_seed.py
python enter.pollinations.ai/src/tier-progression/flows/spore_to_seed.py --env staging
```

Required environment variables:

- `GITHUB_TOKEN`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Adding New Progression Flows

When adding a new flow:

1. Put orchestration in `flows/`.
2. Reuse `shared/` helpers instead of duplicating GitHub scoring or D1 mutation logic.
3. Add or update a workflow in `.github/workflows/` only as the scheduler/entrypoint.
4. Keep implementation notes here instead of recreating a large GitHub-side doc.
