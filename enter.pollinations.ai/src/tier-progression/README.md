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
- `flows/spore-to-microbe-scan.ts`: LLM-based abuse detection and scoring (outputs CSV)
- `flows/spore-to-microbe-enrich.ts`: enrich the scan CSV with Tinybird consumption data
- `flows/spore-to-microbe-review.ts`: apply usage-based rules to adjust block actions
- `flows/spore-to-microbe-apply.ts`: apply tier downgrades from the reviewed report
- `flows/abuse-scan.ts`: usage-first, all-tier abuse scan (read-only) → apply-compatible CSV
- `flows/abuse-scan-lib.ts`: pure scoring/clustering/CSV logic for abuse-scan (unit-tested)
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

The downgrade pipeline is `spore-to-microbe-scan.ts` → `spore-to-microbe-enrich.ts`
→ `spore-to-microbe-review.ts` → `spore-to-microbe-apply.ts`.

High-level behavior:

1. Find the most recent microbe user's registration date as cutoff (`--since-last-block`).
2. Fetch users created after that cutoff from D1.
3. Score users via LLM (Gemini) in overlapping chunks, looking for coordinated abuse patterns (`scan`, outputs CSV).
4. Enrich the CSV with Tinybird consumption data (`enrich`).
5. Apply usage-based rules to adjust block actions (`review`).
6. Downgrade users with a `block` action to `microbe` tier with 0.1 pollen balance (`apply`).

There is no scheduled workflow for this pipeline. Run the steps manually from
`enter.pollinations.ai/`:

```bash
npx tsx src/tier-progression/flows/spore-to-microbe-scan.ts
npx tsx src/tier-progression/flows/spore-to-microbe-enrich.ts
npx tsx src/tier-progression/flows/spore-to-microbe-review.ts
npx tsx src/tier-progression/flows/spore-to-microbe-apply.ts apply-blocks
```

### abuse scan (usage-first, all tiers, read-only)

`flows/abuse-scan.ts` ranks all non-microbe users by usage abuse signals (hammering +
errors, free-credit burn) with IP-rotation / tight-subnet / email-root clustering, gates
out payers (D1 purchase history + in-window pack pollen, with a live Stripe fallback on the
shortlist), and writes `abuse-scan-report.csv` in the apply CSV schema. It mutates nothing.
Pure logic + tests live in `abuse-scan-lib.ts` / `test/abuse-scan-lib.test.ts`.

```bash
npx tsx src/tier-progression/flows/abuse-scan.ts --days 7
# review the CSV, then dry-run apply (--report is required):
npx tsx src/tier-progression/flows/spore-to-microbe-apply.ts apply-blocks \
  --env production --report src/tier-progression/abuse-scan-report.csv --dry-run
```

Uses the prod Tinybird read token + Stripe key from `secrets/prod.vars.json` (NOT `.tinyb`,
which is staging). Auto-`block` is reserved for severe hammering or clustered farms;
mid-volume lone hammerers land in `review` for a human to confirm.

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
