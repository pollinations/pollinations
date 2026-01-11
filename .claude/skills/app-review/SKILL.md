---
name: app-review
description: Review and process app submissions for the Pollinations showcase. Parse issues, validate submissions, create PRs, handle user corrections.
---

# App Review

**Invocation:** `/app-review #123`

---

## Required Fields

- `name` - App name
- `url` - Must start with http:// or https://
- `description` - What the app does (~80 chars)
- `category` - One of: `vibeCoding`, `creative`, `games`, `hackAndBuild`, `chat`, `socialBots`, `learn`

**Optional:** `repo`, `discord`, `other`, `language` (ISO code like zh-CN)

---

## Workflow

### 1. Fetch Issue

```bash
gh issue view $ISSUE_NUMBER --repo pollinations/pollinations --json number,title,body,author,comments,labels
```

Parse body + ALL user comments. Understand corrections like "I fixed it" or "discord is @newname".

### 2. Validate

Missing required fields → Comment what's missing → Add `TIER-APP-INCOMPLETE` → STOP

### 3. Check Duplicates

```bash
PROJECT_JSON='{"name":"...","url":"...","repo":"..."}' \
GITHUB_USERNAME="author" \
node .github/scripts/app-check-duplicate.js
```

`url_exact`, `repo_exact`, `name_user_exact` → Reject + close issue

### 4. Check Registration

```bash
cd enter.pollinations.ai
npx wrangler d1 execute DB --remote --env production \
  --command "SELECT id FROM user WHERE LOWER(github_username) = LOWER('author');"
```

Not registered → Comment asking to register → Add `TIER-APP-INCOMPLETE` → STOP

### 5. Create or Update PR

```bash
# Check if PR already exists for this issue
EXISTING_PR=$(gh pr list --search "Fixes #$ISSUE_NUMBER" --json number,headRefName --jq '.[0]')

if [ -n "$EXISTING_PR" ]; then
  # Update existing PR branch
  BRANCH=$(echo "$EXISTING_PR" | jq -r '.headRefName')
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git reset --hard origin/main
else
  # Create new branch
  SLUG=$(echo "$APP_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')
  BRANCH="auto/app-${ISSUE_NUMBER}-${SLUG}"
  git checkout -b "$BRANCH"
fi

export NEW_ROW="| $EMOJI | [$APP_NAME]($URL) | $DESC | $LANG | $CATEGORY | @$AUTHOR | $REPO | $STARS | $DISCORD | $OTHER | $(date +%Y-%m-%d) |"
node .github/scripts/app-prepend-row.js
node .github/scripts/app-update-readme.js

AUTHOR_ID=$(gh api "users/$AUTHOR" --jq '.id')
git add -A && git commit -m "Add $APP_NAME to $CATEGORY

Co-authored-by: $AUTHOR <${AUTHOR_ID}+${AUTHOR}@users.noreply.github.com>
Fixes #$ISSUE_NUMBER"

git push origin "$BRANCH" --force-with-lease

# Only create PR if it doesn't exist
if [ -z "$EXISTING_PR" ]; then
  gh pr create --title "Add $APP_NAME to $CATEGORY" \
    --body "## 🆕 $APP_NAME

- **Category:** \`$CATEGORY\`
- **URL:** $URL

Fixes #$ISSUE_NUMBER" \
    --label "TIER-APP-REVIEW-PR" --base main --head "$BRANCH"
fi
```

### 6. Update Issue

```bash
gh issue edit $ISSUE_NUMBER --remove-label "TIER-APP" --remove-label "TIER-APP-INCOMPLETE" --add-label "TIER-APP-REVIEW"

# Only comment if new PR created, not on updates
if [ -z "$EXISTING_PR" ]; then
  gh issue comment $ISSUE_NUMBER --body "🎉 PR created for **$APP_NAME**! A maintainer will review shortly."
fi
```

---

## Labels

| Label | Meaning |
|-------|---------|
| `TIER-APP` | New - process it |
| `TIER-APP-INCOMPLETE` | Waiting for user |
| `TIER-APP-REVIEW` | PR created |
| `TIER-APP-REJECTED` | Rejected |

---

## APPS.md Format

```
| Emoji | Name | Description | Language | Category | GitHub | Repo | Stars | Discord | Other | Submitted |
```

Pick creative emoji based on app type. Stars format: `⭐123` or `⭐1.2k`.

---

## Notes

- Parse FULL context (body + comments)
- Understand user corrections
- Only comment when needed
- Use existing scripts in `.github/scripts/`
