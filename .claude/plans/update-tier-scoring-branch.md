# Plan: Update `feat/unified-tier-scoring` branch to main

## Context

PR #8340 (`feat/unified-tier-scoring` by voodoohop) implements a unified LLM-based tier scoring system. It's 16 commits ahead of main but significantly behind. Main has evolved with production pollen values, fraud detection, quality filtering, and other changes that need to be incorporated.

Related PR #9163 (`feat/microbe-first-tier` by ElliotEtag) covers similar ground — see comparison notes at the end. This plan focuses only on bringing #8340 up to date with main.

## Branch: `feat/unified-tier-scoring`

## Steps

### Step 1: Merge main into the branch

```bash
git checkout feat/unified-tier-scoring
git fetch origin main
git merge origin/main --no-edit
```

This will produce ~13 conflicts. Resolve them as follows:

### Step 2: Resolve conflicts

#### 2a. Deleted Python scripts (modify/delete conflicts)
- `.github/scripts/user_upgrade_spore_to_seed.py` — **keep deleted**
- `.github/scripts/user_validate_github_profile.py` — **keep deleted**

These scripts were intentionally replaced by `score-for-upgrade.ts`. But note the useful changes main added (port these in Step 3):
- Quality filtering: `diskUsage > 0` to exclude empty repos
- Fraud detection: `burst_empty_repos`, `star_uniformity`, `empty_repo_dominance`, `repo_quality_gap`
- 90-day commit window instead of all-time
- Batch SQL upgrades (500/batch) instead of per-user calls

To resolve: `git rm .github/scripts/user_upgrade_spore_to_seed.py .github/scripts/user_validate_github_profile.py`

#### 2b. `enter.pollinations.ai/src/tier-config.ts` — **merge carefully**

Main's version has:
- Pollen values: microbe=0, spore=0.01, seed=0.15, flower=10, nectar=20, router=500
- `color` and `cadence` fields on each tier
- `getTierColor()` and `getTierCadence()` functions
- `DEFAULT_TIER = "spore"`

Your version has:
- Pollen values: microbe=0.1, spore=1, seed=3 (different from production!)
- No `color`/`cadence` fields
- Full scoring system: `SCORING_CRITERIA[]`, `TIER_THRESHOLDS`, `computeScore()`, `bestTierForMetrics()`, etc.
- `DEFAULT_TIER = "microbe"`

Resolution:
- **Use main's pollen values** (0, 0.01, 0.15, 10, 20, 500) — these are live in production
- **Add main's `color` and `cadence` fields** to TIERS object
- **Add main's `getTierColor()` and `getTierCadence()` functions**
- **Keep `DEFAULT_TIER = "microbe"`** (your intended change)
- **Keep all your scoring system code** (SCORING_CRITERIA, thresholds, compute functions, etc.)
- Update the `cadence` type union to include `"none"` (main has this for microbe)

#### 2c. `enter.pollinations.ai/src/client/components/balance/tier-explanation.tsx`
- **Keep your version** — it has the grouped scoring UI that main doesn't have
- But check if main added any other changes to this file that need merging (unlikely based on the diff)

#### 2d. `enter.pollinations.ai/scripts/detect-abuse.ts`
- **Keep your refactored version** (uses extracted `llm-scorer.ts`)
- Main may have minor changes — check the conflict markers and incorporate any non-conflicting updates

#### 2e. `enter.pollinations.ai/observability/datasources/scoring_snapshot.datasource`
- **add/add conflict** — your version added this file, main also added it
- Compare both versions, keep whichever has more complete schema (likely yours)

#### 2f. Unrelated files — **take main's version**:
- `.gitignore`
- `apps/operation/economics/README.md`
- `apps/operation/economics/docker-compose.prod.yml`
- `apps/operation/economics/docker-compose.yml`
- `apps/operation/economics/secrets/secrets.vars.json`
- `enter.pollinations.ai/.gitignore`
- `enter.pollinations.ai/secrets/dev.vars.json`

For these: `git checkout origin/main -- <file>` for each

### Step 3: Port main's improvements into `score-for-upgrade.ts`

Main added useful improvements to the Python scripts that should be ported into your TS scorer:

#### 3a. Quality filtering (from `user_validate_github_profile.py`)
In `score-for-upgrade.ts`, when processing GitHub GraphQL results:
- Add `diskUsage` and `createdAt` to the repo query fields (currently fetches `stargazerCount` only)
- Filter repos: only count repos where `diskUsage > 0` for repo count and star totals
- Update GraphQL query to fetch 10 repos (was 5)

#### 3b. Fraud detection flags
Add these 4 checks after scoring each user:
1. **`burst_empty_repos`**: ≥5 repos created in last 7 days with `diskUsage == 0`
2. **`star_uniformity`**: 5+ starred repos share same star count at >60% frequency (exclude count=1)
3. **`empty_repo_dominance`**: ≥5 fetched repos, >80% empty, `totalCount > 20`
4. **`repo_quality_gap`**: `totalCount > 20` but `qualityCount < 3`

If any fraud flag is set: reject the upgrade regardless of score.

#### 3c. 90-day commit window
Change the GraphQL `contributionsCollection` to use `from:` parameter set to 90 days ago. This gives a more meaningful recent-activity signal.

#### 3d. Batch SQL upgrades
If not already batched, ensure tier updates use batch SQL (500 users per UPDATE) rather than per-user calls. Remove any Polar API dependency.

### Step 4: Verify and commit

```bash
# Check no conflict markers remain
grep -r "<<<<<<" enter.pollinations.ai/src/ enter.pollinations.ai/scripts/ .github/
# Run biome
npx biome check --write enter.pollinations.ai/src/tier-config.ts
npx biome check --write enter.pollinations.ai/scripts/score-for-upgrade.ts
# Commit the merge
git add -A
git commit -m "merge main + port quality filtering and fraud detection"
# Push
git push origin feat/unified-tier-scoring
```

### Step 5: Verify the PR builds

Check that PR #8340 CI passes after the push.

---

## Reference: Key files on the branch

| File | Purpose |
|------|---------|
| `enter.pollinations.ai/scripts/score-for-upgrade.ts` | Main upgrade orchestrator (8 criteria, multi-tier) |
| `enter.pollinations.ai/scripts/llm-scorer.ts` | Extracted LLM abuse scorer |
| `enter.pollinations.ai/scripts/detect-abuse.ts` | Standalone abuse detection (thin wrapper over llm-scorer) |
| `enter.pollinations.ai/src/tier-config.ts` | Tier definitions + scoring criteria + compute functions |
| `enter.pollinations.ai/src/client/components/balance/tier-explanation.tsx` | UI: grouped scoring display |
| `.github/workflows/user-upgrade-tiers.yml` | Daily cron workflow |

## Reference: Main's production pollen values

```
microbe: 0      (no pollen)
spore:   0.01   (hourly refill)
seed:    0.15   (hourly refill)
flower:  10     (daily refill)
nectar:  20     (daily refill)
router:  500    (daily refill)
```

## Reference: Conflict file list

```
.github/scripts/user_upgrade_spore_to_seed.py        → delete (keep your deletion)
.github/scripts/user_validate_github_profile.py       → delete (keep your deletion)
.gitignore                                             → take main
apps/operation/economics/README.md                     → take main
apps/operation/economics/docker-compose.prod.yml       → take main
apps/operation/economics/docker-compose.yml            → take main
apps/operation/economics/secrets/secrets.vars.json     → take main
enter.pollinations.ai/.gitignore                       → take main
enter.pollinations.ai/observability/datasources/scoring_snapshot.datasource → compare, keep more complete
enter.pollinations.ai/scripts/detect-abuse.ts          → keep yours, check for main additions
enter.pollinations.ai/secrets/dev.vars.json            → take main
enter.pollinations.ai/src/client/components/balance/tier-explanation.tsx → keep yours
enter.pollinations.ai/src/tier-config.ts               → merge: main's values + your scoring system
```
