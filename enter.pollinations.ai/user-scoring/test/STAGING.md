# Staging Database

Stratified random sample from production (seeded 2026-03-19).

## Contents

| Tier | Count | Prod % | Notes |
|------|-------|--------|-------|
| spore | 3,250 | 65.9% | Largest group |
| microbe | 1,000 | 19.6% | ~37% banned (mirrors prod) |
| seed | 650 | 13.4% | |
| flower | 70 | 0.93% | Slightly oversampled |
| nectar | 25 | 0.06% | Nearly all prod nectars |
| router | 1 | 0.002% | The only one |
| **Total** | **4,996** | | |

Related tables: 5,983 apikeys, 4,997 accounts, 477 banned users.

Fresh reseeds now copy `trust_score`, `score`, and `score_checked_at` from production too.
Routine testing should not depend on the global staging values of those columns:
[`reset-cohort.ts`](./reset-cohort.ts) is the step that prepares the cohort state used by [`TESTING.md`](./TESTING.md).

## Re-seeding

```bash
cd enter.pollinations.ai
node user-scoring/test/seed-staging.mjs
```

Edit `SAMPLE` in the script to adjust tier sizes.

After a reseed:

1. Run `npx tsx user-scoring/test/cohort-setup.ts`
2. Follow [`TESTING.md`](./TESTING.md) from the reset step onward
