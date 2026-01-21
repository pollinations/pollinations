---
name: app-review
description: Review and process app submissions for the Pollinations showcase. Parse issues, validate submissions, create PRs, handle user corrections.
---

# App Review

Process app submissions from GitHub issues. Validation (registration, duplicates, stars) is pre-done by workflow.

---

## Categories

Pick the best fit: `Creative`, `Chat`, `Games`, `Dev_Tools`, `Vibes`, `Social_Bots`, `Learn`

---

## APPS.md Row Format

```
| EMOJI | Name | Web_URL | Description (~80 chars) | LANG | category | @author | github_id | repo_url | ⭐stars | discord | other | Submitted_Date | Issue_URL | Approved_Date |
```

- **Submitted_Date**: Issue creation date (when user submitted)
- **Issue_URL**: Link to original GitHub issue
- **Approved_Date**: PR merge date (when app was approved)

---

## If Validation Failed

Comment helpfully based on error:
- Not registered → Ask to register at enter.pollinations.ai
- Duplicate → Explain and close issue
- Add appropriate label (TIER-APP-INCOMPLETE or TIER-APP-REJECTED)

---

## If Validation Passed

```bash
# 1. Fetch issue
gh issue view $ISSUE_NUMBER --json body,author,title

# 2. Parse fields: name, url, description, category, repo, discord, language

# 3. Pick creative emoji

# 4. Create/update branch
git fetch origin main
# If existing_pr: checkout and reset
# Else: git checkout -b auto/app-${ISSUE_NUMBER}-slug origin/main

# 5. Add row
export NEW_ROW="| EMOJI | NAME | URL | DESC | LANG | CAT | @AUTHOR | GITHUB_ID | REPO | STARS | DISCORD | | SUBMITTED_DATE | ISSUE_URL | $(date +%Y-%m-%d) |"
node .github/scripts/app-prepend-row.js
node .github/scripts/app-update-readme.js

# 6. Commit and push
git add -A && git commit -m "Add NAME to CATEGORY" && git push origin HEAD --force-with-lease

# 7. Create PR if new (label: TIER-APP-REVIEW-PR)
gh pr create --title "Add NAME to CATEGORY" --body "Fixes #$ISSUE_NUMBER" --label "TIER-APP-REVIEW-PR"

# 8. Update issue label
gh issue edit $ISSUE_NUMBER --remove-label "TIER-APP" --add-label "TIER-APP-REVIEW"
```

---

## Labels

| Label | Meaning |
|-------|---------|
| `TIER-APP` | New submission |
| `TIER-APP-INCOMPLETE` | Waiting for user fix |
| `TIER-APP-REVIEW` | PR created |
| `TIER-APP-REJECTED` | Rejected (duplicate, etc.) |
