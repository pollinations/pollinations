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

- `flows/spore_to_seed.py`: upgrade spore users to seed based on GitHub activity
- `flows/spore-to-microbe-scan.ts`: LLM-based abuse detection and scoring
- `flows/apply-abuse-blocks.ts`: apply tier downgrades from abuse report
- `flows/cleanup-github-users.ts`: audit D1 users against GitHub API (renamed/deleted accounts)
- `shared/github_profile.py`: GitHub identity lookup and scoring logic
- `shared/d1_updates.py`: shared D1 query and mutation helpers
- `shared/tier-update-user.ts`: direct tier updates in D1 (used by app workflows)

## Current Flows

### spore → seed (upgrade)

The upgrade flow is `spore_to_seed.py`.

High-level behavior:

1. Fetch eligible `spore` users from D1, skipping banned users.
2. Prioritize users created in the last 8 hours, then process a rolling slice of older users.
3. Resolve GitHub accounts by immutable `github_id`, not username.
4. Score GitHub activity through `shared/github_profile.py`.
5. Upgrade approved users to `seed`.

This flow is triggered by:

- `.github/workflows/tier-progression-spore-to-seed.yml`

### spore → microbe (abuse downgrade)

The downgrade flow is `spore-to-microbe-scan.ts` + `apply-abuse-blocks.ts`.

High-level behavior:

1. Find the most recent microbe user's registration date as cutoff (`--since-last-block`).
2. Fetch users created after that cutoff from D1.
3. Score users via LLM (Gemini) in overlapping chunks, looking for coordinated abuse patterns.
4. Users scoring >= 70 are flagged for blocking.
5. Blocked users are downgraded to `microbe` tier with 0.1 pollen balance.

This flow is triggered by:

- `.github/workflows/user-downgrade-spore-to-microbe.yml`

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
