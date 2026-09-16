Commit and push changes safely. Follows branch rules to avoid mistakes.

## Step 1: Detect branch state

```bash
git branch --show-current
```

### If on `main`:
- **NEVER commit or push to main directly**
- Create a new feature branch: `git checkout -b feat/<descriptive-name>`
- Continue to Step 2

### If on a feature branch:
- Check if this branch has an open PR:
```bash
gh pr list --head <branch-name> --json number,state,url --jq '.[] | select(.state=="OPEN")'
```
- **If PR is OPEN**: push to this branch (Step 2), do NOT create a new PR
- **If no open PR**: check if the branch was previously merged:
```bash
gh pr list --head <branch-name> --state merged --json number --jq '.[0].number'
```
  - **If merged**: the branch is stale — create a new branch from main:
    ```bash
    git checkout main && git pull && git checkout -b feat/<new-name>
    ```
    Then cherry-pick or re-apply changes as needed
  - **If never had a PR**: push and create a new PR (Step 3)

## Step 2: Commit and push

0. Finish any dependency-sensitive checks (lockfile/install-affecting, e.g. `npm ci`, a build) BEFORE committing — commit hooks can probe package-manager commands and mutate ignored files like `node_modules`; don't run one in parallel with `git commit`. If a hook does mutate the install, restore from the committed lockfile and rerun affected checks serially.
1. `git status` and `git diff --stat` to review changes
2. Stage relevant files (avoid `.env`, credentials, `.claude/settings.local.json`)
3. Commit with conventional format (`feat:`, `fix:`, `refactor:`, etc.). If crediting more than one contributor, put every `Co-authored-by:` line together in one contiguous trailer block at the end of the message — a blank line between them causes `git interpret-trailers` (and GitHub's squash merge) to drop all but the last one. Verify with `git interpret-trailers --parse` before pushing.
4. Re-check `git status --short` after the commit, before pushing — if a hook left behind untracked or modified files, inspect their provenance and remove only artifacts verified to be hook-created.
5. Push: `git push` (or `git push -u origin HEAD` for new branches)

## Step 3: Create PR (only if no open PR exists)

```bash
gh pr create --title "type: short description" --body "$(cat <<'EOF'
## Summary
- Bullet points, <200 words, no fluff

## Test plan
- [ ] Verification steps

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Follow PR format from AGENTS.md:
- Use "- Adds X", "- Fix Y" format
- 3-5 bullets max
- Simple titles: "fix:", "feat:", "Add"

After a squash merge, verify the resulting commit message actually carried every `Co-authored-by:` line — a non-contiguous trailer block can survive review in the PR description while still being dropped from the squash commit. Never rewrite a shared branch to repair credit after the fact.
