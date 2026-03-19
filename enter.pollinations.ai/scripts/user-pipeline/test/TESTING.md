# How to Test the User Pipeline

All scripts in this directory (`scripts/user-pipeline/test/`).

---

## Prerequisites

1. **Wrangler authenticated** — `npx wrangler whoami` should show the Pollinations account
2. **GitHub token** — set `GITHUB_TOKEN` in `.env` at the repo root (or use GitHub App auth)
3. **LLM API key** — create `enter.pollinations.ai/.testingtokens` with:
   ```
   ENTER_API_TOKEN_REMOTE=sk_...
   ```
4. **Staging database** — already seeded with a production sample. See [STAGING.md](STAGING.md). Re-seeding is a rare manual operation — do not run it as part of regular testing.

---

## Full Test Sequence (run in this order)

### 1. Unit tests — fast, no external calls (~5s)

```bash
cd enter.pollinations.ai
npx vitest run scripts/user-pipeline/test/
```

Covers: LLM CSV parsing, GitHub risk detection, GitHub scoring logic.

### 2. Build cohort files — once, or after re-seeding staging

```bash
npx tsx scripts/user-pipeline/test/cohort-setup.ts
```

Creates 4 files in `/tmp/`: `cohort-group-a.txt`, `cohort-group-b.txt`, `cohort-group-c.txt`, `cohort-daily.txt`.
Skip this step if the files already exist and staging hasn't been re-seeded.

### 3. Reset cohort — before every staging run

```bash
npx tsx scripts/user-pipeline/test/reset-cohort.ts
```

Resets group A → microbe (trust_score = NULL), groups B+C → spore (trust_score = 100), clears all GitHub scores and bans.

### 4. Run pipelines against staging

```bash
# Hourly pipeline: trust gate + GitHub scoring for 200 microbe users (~5-10 min)
npm run user-pipeline:replay-hourly -- --emails-file /tmp/cohort-group-a.txt

# Daily pipeline: GitHub scoring for 300 spore users — loops ~7 passes (~15-20 min)
npm run user-pipeline:replay-daily -- --emails-file /tmp/cohort-daily.txt
```

### 5. Verify results

```bash
npx tsx scripts/user-pipeline/test/verify-results.ts
```

Exits 0 if all checks pass, exits 1 if any fail.

---

## Test Cohort

500 users split into 3 groups, all with real GitHub accounts:

| Group | File | Initial Tier | Count | Pipeline | Purpose |
|-------|------|-------------|-------|----------|---------|
| A | `/tmp/cohort-group-a.txt` | microbe | 200 | Hourly | Trust gate + GitHub scoring |
| B | `/tmp/cohort-group-b.txt` | spore | 200 | Daily | Known-good accounts (high promotion expected) |
| C | `/tmp/cohort-group-c.txt` | spore | 100 | Daily | Genuine spores (lower promotion expected) |

Combined daily file: `/tmp/cohort-daily.txt` (B + C = 300 users).

---

## Pipelines Under Test

### Hourly Pipeline (Group A)

```
microbe -> [trust-score] -> [github-score] -> spore or seed
                |                  |
                v                  v
           banned (low trust)  banned (deleted account)
```

The replay script runs both steps in sequence:
1. Trust scoring via LLM (writes `trust_score` to D1)
2. GitHub scoring + tier promotion (writes `score`, updates `tier`)

### Daily Pipeline (Groups B + C)

```
spore -> [github-score] -> seed (if score >= 8 and not suspicious)
              |
              v
         banned (deleted account)
```

Each pass scores ~1/7 of spores. The replay script loops automatically until all cohort users are scored (~7 passes for 300 users).

---

## Expected Outcomes

| Check | Expected |
|-------|----------|
| Group A: all users have `trust_score` | Every user scored or banned |
| Group A: some blocked by trust gate | > 0 stay microbe or get banned |
| Group A: majority promoted | > 50% reach spore or seed |
| Group B: high seed promotion | >= 60% promoted to seed |
| Group C: lower rate than B | Promotion rate < Group B |
| All B+C users scored | 0 rows with `score_checked_at = 0` |

---

## Testing a Single Pipeline

```bash
# Reset first
npx tsx scripts/user-pipeline/test/reset-cohort.ts

# Hourly only
npm run user-pipeline:replay-hourly -- --emails-file /tmp/cohort-group-a.txt
npx tsx scripts/user-pipeline/test/verify-results.ts --group a

# Daily only
npm run user-pipeline:replay-daily -- --emails-file /tmp/cohort-daily.txt
npx tsx scripts/user-pipeline/test/verify-results.ts --group daily
```

## Dry Run (no D1 writes)

```bash
npm run user-pipeline:replay-hourly -- --emails-file /tmp/cohort-group-a.txt --hourly-dry-run
npm run user-pipeline:replay-daily -- --emails-file /tmp/cohort-daily.txt --dry-run
```

## Checking State

```bash
# Check cohort state without modifying anything
npx tsx scripts/user-pipeline/test/reset-cohort.ts --verify-only

# Direct D1 query
npx wrangler d1 execute DB --remote --env staging \
  --command "SELECT tier, COUNT(*) as n FROM user GROUP BY tier ORDER BY n DESC" --json
```

---

## Scripts in This Directory

| Script | Purpose | When to run |
|--------|---------|-------------|
| `cohort-setup.ts` | Exports 500 emails from staging into `/tmp/cohort-*.txt` | Once after seeding staging |
| `reset-cohort.ts` | Resets cohort users to initial tier/score state | Before every staging run |
| `verify-results.ts` | Checks pipeline outcomes against expected thresholds | After running pipelines |
| `replay-hourly-new-users.ts` | End-to-end hourly pipeline test harness | `npm run user-pipeline:replay-hourly` |
| `replay-daily-spore-recheck.ts` | End-to-end daily pipeline test harness | `npm run user-pipeline:replay-daily` |
| `seed-staging.mjs` | Seeds staging DB with a production sample | Rare manual operation only — see STAGING.md |
| `user-pipeline.test.ts` | Unit tests for LLM CSV parsing | `npx vitest run` |
| `github-risk.test.ts` | Unit tests for profile risk detection | `npx vitest run` |
| `github-score.test.ts` | Unit tests for GitHub activity scoring | `npx vitest run` |

---

## File Layout

```
scripts/user-pipeline/
├── test/                            # <-- you are here
│   ├── TESTING.md                   # This guide
│   ├── STAGING.md                   # Staging DB documentation
│   ├── cohort-setup.ts              # Build cohort email files
│   ├── reset-cohort.ts              # Reset cohort to initial state
│   ├── verify-results.ts            # Verify pipeline outcomes
│   ├── replay-hourly-new-users.ts   # End-to-end hourly test harness
│   ├── replay-daily-spore-recheck.ts # End-to-end daily test harness
│   ├── seed-staging.mjs             # One-time staging DB seed (rare, do not run regularly)
│   ├── user-pipeline.test.ts        # Unit tests: LLM CSV parsing
│   ├── github-risk.test.ts          # Unit tests: profile risk detection
│   └── github-score.test.ts         # Unit tests: GitHub scoring logic
├── audit-github-accounts.ts         # GitHub account audit tool
├── scoring/
│   ├── trust-score.ts               # LLM-based trust scoring
│   ├── trust-score-prompt.md        # LLM prompt template
│   ├── github-score.ts              # GitHub activity scoring
│   └── github-risk.ts               # Profile risk assessment
├── shared/                          # Shared utilities (d1, llm, github, cohort)
├── backfills/
│   ├── backfill-trust-scores.ts     # Staging: set trust_score=100 for non-microbe users
│   └── backfill-spore-scores.ts     # Backfill GitHub scores for existing spore users
├── hourly-new-users.ts              # Hourly pipeline entry point
└── daily-spore-recheck.ts           # Daily pipeline entry point
```
