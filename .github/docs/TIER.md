# Tier System

The pollinations.ai tier system rewards developers based on their activity and contributions. Each tier unlocks more daily pollen.

> **Note**: This system is evolving toward a unified point-based model where all activities contribute to a single score.

## Tier Ladder

| Tier | Emoji | Daily Pollen | Requirements |
|------|-------|--------------|--------------|
| Spore | 🦠 | 1 | Sign up |
| Seed | 🌱 | 3 | 7+ dev points (auto-evaluated) |
| Flower | 🌸 | 10 | Publish an app or contribute |
| Nectar | 🍯 | 20 | Coming soon |

---

## Spore → Seed (Automatic)

The upgrade from Spore to Seed is **fully automatic**. No action required from users.

### How It Works

1. **Evaluation frequency**: All Spore users are evaluated daily (midnight UTC)
2. **Workflow**: `.github/workflows/user-upgrade-spore-to-seed.yml`
3. **Validation script**: `.github/scripts/user_validate_github_profile.py`

### Dev Points Calculation

Users need **7+ points** to qualify for Seed tier.

| Metric | Points | Maximum |
|--------|--------|---------|
| GitHub account age | 1 pt/month | 6 pts |
| Commits (any repo) | 0.1 pt each | 1 pt |
| Public repositories | 0.5 pt each | 1 pt |
| **Total possible** | | **8 pts** |

### Example Paths to Seed

- 6-month account + 10 commits = 7 pts ✓
- 6-month account + 2 public repos = 7 pts ✓
- 5-month account + 10 commits + 2 repos = 7 pts ✓

---

## Seed → Flower (Manual)

Flower tier requires a contribution to the pollinations.ai ecosystem.

### Options

1. **Publish an app** - Submit via [App Submission Form](https://github.com/pollinations/pollinations/issues/new?template=tier-app-submission.yml)
2. **Contribute to the ecosystem** - Merged PR to the pollinations repo

---

## Flower → Nectar (Coming Soon)

Details TBD. Will reward sustained ecosystem contribution.

---

## Future: Unified Point System

We're moving toward a single point system where all activities contribute:

- GitHub activity (current Seed criteria)
- App submissions
- PR contributions
- Community engagement
- API usage patterns

This will make tier progression more transparent and gamified.

---

## Technical Details

### Relevant Files

| File | Purpose |
|------|---------|
| `.github/workflows/user-upgrade-spore-to-seed.yml` | Daily evaluation workflow |
| `.github/scripts/user_validate_github_profile.py` | Point calculation logic |
| `enter.pollinations.ai/scripts/tier-update-user.ts` | Tier update script |
| `enter.pollinations.ai/src/client/components/tier-explanation.tsx` | UI component |

### Database

Tier is stored in the `user` table (`tier` column) in the D1 database:
- Valid values: `spore`, `seed`, `flower`, `nectar`, `router`
