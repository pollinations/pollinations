# Full Pipeline Integration Test: Production Clone on Staging

## Overview

1. **Clone Production to Staging** — Export all auth tables (user, session, account, apikey) from production D1 and import into staging
2. **Take Snapshot & Reset** — Save pre-reset tier distribution, then downgrade all spore+seed users to microbe with null trust_score and score
3. **Run Trust Scoring Loop** — Execute LLM-based trust scoring on all reset microbe users (30-user batches), storing results in D1
4. **Run Hourly New-Users Pipeline** — GitHub-score trusted users, promote to seed (score >= 8) or spore (below threshold), ban deleted accounts
5. **Loop Until Convergence** — Repeat steps 3-4 until no unscored microbe users remain (max 20 iterations)
6. **Verify Results** — Compare tier distribution before/after, run coverage + consistency assertions, analyze trace for anomalies

**Two scripts**: `clone-prod-to-staging.ts` (steps 1-2) and `full-pipeline-test.ts` (steps 3-6)

---

## Context

We want an end-to-end "chaos test" for the user scoring pipeline. The goal is to prove that starting from a realistic production dataset, if we reset all spore/seed users back to microbe (with null scores), the pipeline can re-score and re-promote everyone correctly. This validates the full trust-score + hourly-new-users flow at **full production scale**.

## How It Works

### Script 1: `clone-prod-to-staging.ts`

Clones production D1 to staging, then resets spore/seed users to microbe.

1. Export all production tables using `wrangler d1 export --no-schema`
2. Clear staging tables and import production data
3. Verify row counts match between production and staging
4. Take a pre-reset tier snapshot (saved to `/tmp/pipeline-test-pre-snapshot.json`)
5. Downgrade all spore+seed users: `tier='microbe'`, `trust_score=NULL`, `score=NULL`
6. Leave flower/nectar/router untouched (manually promoted, not pipeline-managed)

### Script 2: `full-pipeline-test.ts`

Manually triggers the hourly pipeline in a loop — the exact same scripts that run via the GitHub Action cron (`user-pipeline-hourly-new-users.yml`).

Each iteration:
1. **Trust scoring** — picks up unscored microbe users from D1, scores 30 at a time via LLM, writes trust_score immediately
2. **GitHub check** — picks up trusted users (>=60), validates accounts, scores dev activity, assigns seed (>=8) or spore (<8) or ban
3. **Convergence check** — any microbe users left with trust_score IS NULL? If yes, loop again

After convergence, runs verification:
- Tier distribution comparison (before vs after)
- Coverage: all eligible users scored, all trusted users promoted
- Consistency: no seed with score < 8, no spore with trust < 60, no banned users promoted
- Trace analysis for anomalies

## How to Run

```bash
cd enter.pollinations.ai

# Phase 1: Clone production to staging + reset
npm run user-pipeline:clone-prod-to-staging

# Phase 2: Run full pipeline test (may take hours)
npm run user-pipeline:full-pipeline-test
```

### Options

```bash
# Clone script
npm run user-pipeline:clone-prod-to-staging -- --skip-clone    # only reset, no clone
npm run user-pipeline:clone-prod-to-staging -- --verify-only   # just show current state

# Pipeline test script
npm run user-pipeline:full-pipeline-test -- --dry-run          # preview without changes
npm run user-pipeline:full-pipeline-test -- --verify-only      # just verify current state
npm run user-pipeline:full-pipeline-test -- --max-iterations 5 # limit loop count
```

## Prerequisites

- Wrangler authenticated with Cloudflare (Pollinations account)
- `.testingtokens` file with `ENTER_API_TOKEN_REMOTE=sk_...`
- `GITHUB_TOKEN` in environment or `.env` file
- Sufficient GitHub API rate limit budget (5000 req/hr REST)
- Time: expect 3-5 hours for full production scale (~36,000 users)

## Success Criteria

1. All non-banned users have trust_score assigned
2. All trusted users (trust_score >= 50) promoted to spore or seed
3. Tier distribution roughly matches pre-reset (within ~10% variance)
4. Zero hard-fail consistency violations
5. Trace anomalies < 1% of total users

## Production Scale (as of 2026-03-21)

| Tier | Users |
|------|-------|
| spore | 30,898 |
| microbe | 8,819 |
| seed | 6,026 |
| flower | 485 |
| nectar | 30 |
| router | 1 |
| **Total** | **46,259** |

Users to reset: ~36,924 (spore + seed)
