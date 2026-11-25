#!/usr/bin/env bash
set -e

case "$1" in
  prepare)
    TODAY=$(date -u +%F)
    APPROVED_DATE="$TODAY" node operations/app-management/ingestion/validate-submission.js > "$RUNNER_TEMP/app-validation.json"
    jq -e '.valid == true' "$RUNNER_TEMP/app-validation.json" >/dev/null
    SCREENSHOT_URL=$(jq -r .submission.screenshotUrl "$RUNNER_TEMP/app-validation.json") \
      node operations/app-management/ingestion/upload-screenshot.js > "$RUNNER_TEMP/screenshot-url"
    APP_JSON=$(jq -c --arg screenshotUrl "$(cat "$RUNNER_TEMP/screenshot-url")" '.app + {screenshotUrl: $screenshotUrl}' "$RUNNER_TEMP/app-validation.json")
    # A named quest closes with the submission, paying the submitter.
    QUEST=$(jq -r '.submission.quest // ""' "$RUNNER_TEMP/app-validation.json")
    FIXES="Fixes #${ISSUE_NUMBER}"
    if [ -n "$QUEST" ]; then
      FIXES="${FIXES}, fixes #${QUEST}"
    fi
    {
      echo "app=$APP_JSON"
      echo "name=$(jq -r .submission.name "$RUNNER_TEMP/app-validation.json")"
      echo "category=$(jq -r .submission.category "$RUNNER_TEMP/app-validation.json")"
      echo "url=$(jq -r '.submission.appUrl // .submission.repoUrl' "$RUNNER_TEMP/app-validation.json")"
      echo "description=$(jq -r .submission.description "$RUNNER_TEMP/app-validation.json")"
      echo "user_id=$(jq -r .metadata.githubUserId "$RUNNER_TEMP/app-validation.json")"
      echo "fixes=$FIXES"
    } >> "$GITHUB_OUTPUT"
    ;;
  catalog)
    BRANCH="auto/app-${ISSUE_NUMBER}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
    git switch -c "$BRANCH" origin/main
    NEW_APP="$APP_JSON" node operations/app-management/app.js prepend
    node operations/app-management/update-readme.js
    git config user.name "$BOT_LOGIN"
    git config user.email "${BOT_ID}+${BOT_LOGIN}@users.noreply.github.com"
    git add operations/app-management/app.json README.md
    git commit -m "Add ${APP_NAME} to ${APP_CATEGORY}" -m "$(printf '%s\n%s' \
      "Co-authored-by: ${ISSUE_AUTHOR} <${USER_ID}+${ISSUE_AUTHOR}@users.noreply.github.com>" "$FIXES")"
    git push origin "$BRANCH"
    echo "name=$BRANCH" >> "$GITHUB_OUTPUT"
    ;;
  queue)
    PR_URL=$(printf -- '- Adds [%s](%s) to %s\n- %s\n\n%s\n' \
      "$APP_NAME" "$APP_URL" "$APP_CATEGORY" "$APP_DESCRIPTION" "$FIXES" | gh pr create \
      --repo "$GITHUB_REPOSITORY" \
      --head "$BRANCH" \
      --base main \
      --title "Add ${APP_NAME} to ${APP_CATEGORY}" \
      --body-file -)
    gh pr merge "$PR_URL" --repo "$GITHUB_REPOSITORY" --auto --squash
    echo "url=$PR_URL" >> "$GITHUB_OUTPUT"
    ;;
  wait)
    for _ in $(seq 1 60); do
      STATE=$(gh pr view "$PR_URL" --repo "$GITHUB_REPOSITORY" --json state --jq .state)
      if [ "$STATE" = "MERGED" ]; then
        exit 0
      fi
      if [ "$STATE" = "CLOSED" ]; then
        echo "Catalog PR closed without merging"
        exit 1
      fi
      sleep 10
    done
    echo "Catalog PR did not merge within 10 minutes; check its required checks and merge queue status"
    exit 1
    ;;
  recover)
    BRANCH="auto/app-${ISSUE_NUMBER}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
    OPEN_PR=$(gh pr list --repo "$GITHUB_REPOSITORY" --head "$BRANCH" --state open --json url --jq '.[0].url // empty' || true)
    if [ -n "$OPEN_PR" ]; then
      gh issue comment "$ISSUE_NUMBER" --repo "$GITHUB_REPOSITORY" --body "The catalog PR is still open. Check its required checks and merge queue status: $OPEN_PR"
      exit 0
    fi
    if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
      git push origin --delete "$BRANCH" || true
    fi

    TARGET_LABEL=APP-REVIEW
    DETAILS=""
    if [ -f "$RUNNER_TEMP/app-validation.json" ] && jq -e '.valid == false and (.system_error == null)' "$RUNNER_TEMP/app-validation.json" >/dev/null; then
      TARGET_LABEL=APP-NEEDS-INFO
      DETAILS=$(jq -r '.errors[]? | "- " + .' "$RUNNER_TEMP/app-validation.json")
    fi

    gh issue edit "$ISSUE_NUMBER" --repo "$GITHUB_REPOSITORY" --remove-label APP-APPROVED || true
    gh issue edit "$ISSUE_NUMBER" --repo "$GITHUB_REPOSITORY" --remove-label APP-REVIEW || true
    gh issue edit "$ISSUE_NUMBER" --repo "$GITHUB_REPOSITORY" --remove-label APP-NEEDS-INFO || true
    gh issue edit "$ISSUE_NUMBER" --repo "$GITHUB_REPOSITORY" --add-label "$TARGET_LABEL"

    {
      echo "Automated app publication did not complete. The issue was moved back to \`$TARGET_LABEL\` and the partial branch/PR was cleaned up."
      if [ -n "$DETAILS" ]; then
        echo
        echo "$DETAILS"
      fi
      echo
      echo "[View the failed workflow run](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID})."
    } | gh issue comment "$ISSUE_NUMBER" --repo "$GITHUB_REPOSITORY" --body-file -
    ;;
  *)
    echo "Unknown app submission step: $1" >&2
    exit 2
    ;;
esac
