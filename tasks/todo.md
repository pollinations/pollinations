# Unified Points-Based Tier System

## Goal
Unify all tier transitions into a single points-based system. Users start at **microbe** and automatically upgrade through tiers as they accumulate points. The same daily cron job evaluates ALL users and upgrades them to the highest tier they qualify for.

## Design: Unified Scoring Formula

### Tier Thresholds
| Tier | Points Needed | Pollen/Day | What It Means |
|------|---------------|------------|---------------|
| Microbe 🦠 | 0 (default) | 0.1 | New signup, unverified |
| Spore 🍄 | 2 | 1 | Basic verified account (3+ day old GitHub, some activity) |
| Seed 🌱 | 8 | 3 | Active developer |
| Flower 🌸 | 15 | 10 | Contributor (merged issue/PR in pollinations org) |

### Scoring Signals (unified, additive)

**GitHub Profile Signals** (existing, reused):
| Signal | Points | Max | Notes |
|--------|--------|-----|-------|
| Account age | 0.5/month | 6 | 12 months to max |
| Public commits | 0.1 each | 2 | Total contributions |
| Public repos | 0.5 each | 1 | Repo count |
| GitHub stars | 0.1 each | 5 | Stars across repos |

**Contribution Signals** (new, for Flower):
| Signal | Points | Max | Notes |
|--------|--------|-----|-------|
| Merged PR in pollinations org | 5 each | 10 | Check via GitHub GraphQL |
| Merged issue (app accepted) | 5 each | 10 | Issues closed by merged PR with TIER-APP-COMPLETE label |

**Key insight**: A user who has a merged PR (5 pts) + 8 pts from profile = 13 pts, still needs a bit more. Two merged contributions (10 pts) + basic profile (5 pts) = 15 pts → Flower. This makes Flower achievable but requires real engagement.

### Spore threshold (2 pts) rationale
- 3-day-old account = ~0.05 pts from age alone → NOT enough
- 7-day-old account (0.12 pts) + 1 repo (0.5 pts) + 5 commits (0.5 pts) + 10 stars (1 pt) = 2.12 → qualifies
- **Practical minimum**: ~1 week old account with basic GitHub activity
- This replaces the abuse-based microbe system — new users simply start low and prove themselves

### Flower threshold (15 pts) rationale
- Max profile points = 14 (age 6 + commits 2 + repos 1 + stars 5) — NOT enough alone
- Need at least 1 merged contribution (5 pts) + decent profile (~10 pts) = 15
- Or 2 merged contributions (10 pts) + minimal profile (5 pts) = 15
- This ensures Flower requires actual pollinations.ai contribution, not just a good GitHub profile

---

## Implementation Plan

### Step 1: Change default tier to microbe
**Files:**
- `enter.pollinations.ai/src/tier-config.ts` — Change `DEFAULT_TIER` from `"spore"` to `"microbe"`
- `enter.pollinations.ai/src/db/schema/better-auth.ts` — Change `.default("spore")` to `.default("microbe")` on line 32
- `enter.pollinations.ai/src/client/components/balance/pollen-balance.tsx` — Change default param from `"spore"` to `"microbe"` on line 63

**Note**: No DB migration needed for existing users — they keep their current tiers. Only new signups start at microbe.

### Step 2: Create unified scoring config
**New file:** `.github/scripts/tier_scoring_config.json`

```json
{
  "tiers": [
    { "name": "spore", "threshold": 2 },
    { "name": "seed", "threshold": 8 },
    { "name": "flower", "threshold": 15 }
  ],
  "signals": {
    "github_profile": {
      "age_days": { "multiplier": 0.016667, "max": 6.0, "comment": "0.5pt/month" },
      "commits": { "multiplier": 0.1, "max": 2.0 },
      "repos": { "multiplier": 0.5, "max": 1.0 },
      "stars": { "multiplier": 0.1, "max": 5.0 }
    },
    "contributions": {
      "merged_prs": { "multiplier": 5.0, "max": 10.0 },
      "merged_issues": { "multiplier": 5.0, "max": 10.0 }
    }
  }
}
```

### Step 3: Extend GitHub GraphQL query to check contributions
**File:** `.github/scripts/user_validate_github_profile.py`

Add to `build_query()`: query the user's merged PRs in `pollinations/pollinations` repo. GitHub GraphQL supports:
```graphql
search(query: "author:{username} repo:pollinations/pollinations is:pr is:merged", type: ISSUE, first: 5) {
  issueCount
}
```

And for merged issues with app-complete label:
```graphql
search(query: "author:{username} repo:pollinations/pollinations is:issue label:TIER-APP-COMPLETE is:closed", type: ISSUE, first: 5) {
  issueCount
}
```

Update `score_user()` to include these new signals and return the **best qualifying tier** (not just approved/rejected).

### Step 4: Generalize the upgrade script
**Rename:** `.github/scripts/user_upgrade_spore_to_seed.py` → `.github/scripts/user_upgrade_tiers.py`

Key changes:
- Query ALL users below flower tier (microbe, spore, seed) — not just spore
- For each user, calculate total score and determine highest qualifying tier
- Only upgrade if the qualifying tier is higher than current tier
- Same day-based slicing strategy (1/7th per day)
- New users (last 24h) still checked first

```python
# Fetch users below flower tier
query = """
    SELECT github_username, tier FROM user
    WHERE tier IN ('microbe', 'spore', 'seed')
    AND github_username IS NOT NULL
"""
```

The `upgrade_user()` function already accepts a `--tier` parameter and `tier-update-user.ts` already prevents downgrades, so this mostly works.

### Step 5: Update the workflow
**Rename:** `.github/workflows/user-upgrade-spore-to-seed.yml` → `.github/workflows/user-upgrade-tiers.yml`

Changes:
- Update name and script reference
- Same schedule (daily midnight UTC)
- Same env vars + concurrency

### Step 6: Simplify the app-upgrade-tier workflow
**File:** `.github/workflows/app-upgrade-tier.yml`

The PR-merge workflow can stay as-is for the **celebration/labeling** logic, but remove the direct tier upgrade. Instead:
- Option A: Keep instant upgrade on PR merge (better UX — user gets Flower immediately)
- Option B: Let the daily cron pick it up (simpler, but delayed)

**Recommendation: Option A** — Keep instant upgrade on PR merge for responsiveness, but the daily cron will also catch it as a safety net. The `tier-update-user.ts` script already prevents double-upgrades.

### Step 7: Remove abuse-specific microbe downgrade
The `detect-abuse.ts` / `apply-abuse-blocks.ts` scripts can remain for actively blocking bad actors (setting tier to microbe + ban). But the *default* path is now organic: everyone starts at microbe and earns their way up.

### Step 8: Update UI
**File:** `enter.pollinations.ai/src/client/components/balance/tier-explanation.tsx`

- **Microbe**: "Sign up" → no change needed
- **Spore**: Change from "Auto-verified" / "Checked on signup" → "2+ dev points" / "Auto-upgraded daily" (same tooltip pattern as Seed)
- **Seed**: No change (already shows "8+ dev points")
- **Flower**: Change from "Publish an app" → "15+ dev points (incl. contribution)" with tooltip showing the contribution signals
- Add tooltip to Spore showing the 2-point threshold breakdown

### Step 9: Update tier-explanation tooltip
Add a unified tooltip that shows the full scoring table for any tier, making it clear that all tiers use the same points system with different thresholds.

---

## Files Changed Summary

| File | Change |
|------|--------|
| `enter.pollinations.ai/src/tier-config.ts` | DEFAULT_TIER → "microbe" |
| `enter.pollinations.ai/src/db/schema/better-auth.ts` | SQL default → "microbe" |
| `enter.pollinations.ai/src/client/components/balance/pollen-balance.tsx` | Default param → "microbe" |
| `.github/scripts/tier_scoring_config.json` | **NEW** — shared scoring config |
| `.github/scripts/user_validate_github_profile.py` | Add contribution signals, return target tier |
| `.github/scripts/user_upgrade_spore_to_seed.py` → `user_upgrade_tiers.py` | Query all sub-flower users, upgrade to best tier |
| `.github/workflows/user-upgrade-spore-to-seed.yml` → `user-upgrade-tiers.yml` | Rename + update script ref |
| `.github/workflows/app-upgrade-tier.yml` | Keep as-is (instant flower on merge, cron as safety net) |
| `enter.pollinations.ai/src/client/components/balance/tier-explanation.tsx` | Update Spore/Flower unlock descriptions |
| `.github/docs/TIER-SYSTEM.md` | Update documentation |

## Migration Notes

- **Existing users**: No changes. Users already at spore/seed/flower keep their tiers.
- **New users**: Start at microbe (0.1 pollen/day), auto-upgrade within days if they have a decent GitHub profile.
- **Abuse users**: The detect-abuse system can still force-downgrade to microbe. The unified cron won't override a ban.
- **Backward compatible**: `tier-update-user.ts` already prevents downgrades, so the cron is safe to run on all users.

## Open Questions

- [ ] Exact Flower threshold (15 suggested — requires at least 1 merged contribution)
- [ ] Should Spore threshold be 2 or 3? (2 = ~1 week old account with minimal activity)
- [ ] Should the daily cron also re-evaluate Flower users for Nectar? (future)
