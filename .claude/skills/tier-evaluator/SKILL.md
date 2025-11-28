---
name: tier-evaluator
description: Evaluate and upgrade a Pollinations user's tier based on GitHub activity and project contributions. Use when asked to check/upgrade user tiers.
---

# Tier Levels
- 🍄 **Spore** - Default (no activity)
- 🌱 **Seed** - Has engagement with Pollinations
- 🌸 **Flower** - Contributed code or project
- 🍯 **Nectar** - Manual only (strategic partners)

# 🌸 Flower Tier (check first - any ONE qualifies)

## Is a GitHub contributor to pollinations?
```bash
gh api 'search/commits?q=repo:pollinations/pollinations+author:USERNAME' --jq '.total_count'
```
Returns > 0 if they have commits.

## Has a project in our lists?
```bash
grep -ri "author.*USERNAME" pollinations.ai/src/config/projects/
```

If either matches → **Flower** ✓

# 🌱 Seed Tier (any ONE qualifies)

## Involved in issues/PRs?
```bash
gh api 'search/issues?q=repo:pollinations/pollinations+involves:USERNAME' --jq '.total_count'
```
Returns > 0 if they opened, commented, or were mentioned.

## Has made a payment?
Check enter.pollinations.ai database for payment history.

## Starred repo? (cached)
```bash
.claude/skills/tier-evaluator/fetch-stargazers.sh USERNAME
```
Returns "yes" or "no". Auto-fetches if cache is stale (>1 day).

If any match → **Seed** ✓

# Update tier
Update via enter.pollinations.ai admin API or database.
