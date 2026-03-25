# Tier Progression

Python-based orchestration and shared evaluation helpers for automated tier changes.

## Layout

- `flows/`: concrete progression flows such as `spore_to_seed.py`
- `shared/github_profile.py`: GitHub lookup and scoring logic
- `shared/d1_updates.py`: shared D1 read/write helpers used by flows

## Entry Point

The current scheduled flow is:

```bash
python enter.pollinations.ai/src/tier-progression/flows/spore_to_seed.py --dry-run
```
