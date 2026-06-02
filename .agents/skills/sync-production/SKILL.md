---
name: sync-production
description: Sync the main branch into production via the GitHub merges API. Pre-checks for merge conflicts and bails out with a clear reason if the merge isn't clean. Use when asked to merge main into production, deploy main to production, or sync production.
---

# Sync Production

Server-side merge of `main` → `production` using the GitHub merges API. No local checkout, no working tree changes.

## Quick Usage

```bash
.claude/skills/sync-production/scripts/sync-production.sh
```

## What It Does

1. Fetches `origin/main` and `origin/production`
2. Lists the commits that would be merged
3. Pre-checks for conflicts with `git merge-tree` (no working tree touched)
4. **If conflicts** → stops with the conflicting paths and exits non-zero. Resolve manually, then re-run.
5. **If clean** → calls `POST /repos/pollinations/pollinations/merges` to create the merge commit on `production` server-side

## Exit Codes

- `0` — merge succeeded, or nothing to merge
- `2` — merge would conflict (paths printed)
- `3` — GitHub merges API rejected the request (branch protection, missing branches, etc.)

## On Conflict

The skill stops and reports the conflicting files. Don't try to force it — surface the reason in chat and resolve manually:

```bash
git checkout production && git pull
git merge main           # resolve conflicts in editor
git push origin production
```

## Overrides

```bash
SYNC_REPO=owner/repo SYNC_BASE=staging SYNC_HEAD=main \
  .claude/skills/sync-production/scripts/sync-production.sh
```

## Notes

- Run from repo root
- Requires `gh` (authenticated, push access to `production`) and `jq`
- Branch protection on `production` that requires PRs will cause exit code `3` — open a PR manually with `gh pr create --base production --head main` in that case
