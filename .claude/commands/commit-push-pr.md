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

0. Finish `npm ci` / builds before committing. Commit hooks may run package-manager commands and touch `node_modules`, so never run them alongside `git commit`. If a hook changed the install, restore from the lockfile and rerun the checks.
1. `git status` and `git diff --stat` to review changes
2. Stage relevant files (avoid `.env`, credentials, `.claude/settings.local.json`)
3. Commit with conventional format (`feat:`, `fix:`, `refactor:`, etc.). Several `Co-authored-by:` lines must sit together at the end with no blank line between them, or squash merge keeps only the last one. Check with `git interpret-trailers --parse`.
4. Run `git status --short` again before pushing. Remove only files a hook demonstrably created.
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

After a squash merge, check the squash commit kept every `Co-authored-by:` line. If one was dropped, never rewrite the shared branch to fix it.
