Commit changes, push to remote, and create a PR.

1. First check git status and diff:
```bash
git status
git diff --stat
```

2. Create a descriptive commit message using conventional commits format (feat:, fix:, refactor:, etc.)

3. Add and commit:
```bash
git add -A
git commit -m "your commit message"
```

4. Push to current branch:
```bash
git push origin HEAD
```

5. Create PR with bullet-point description (<200 words, no fluff):
```bash
gh pr create --title "your title" --body "your description"
```

Follow PR format from AGENTS.md:
- Use "- Adds X", "- Fix Y" format
- 3-5 bullets for most PRs
- Simple titles: "fix:", "feat:", "Add"
