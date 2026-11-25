#!/usr/bin/env bash
set -e

manager_dir="$(dirname "$0")"
if [ "$GITHUB_EVENT_NAME" != "workflow_dispatch" ]; then
  export PROJECT_MANAGER_EVENT_PATH="$GITHUB_EVENT_PATH"
  exec python "$manager_dir/project_manager.py"
fi
if [ "$MODEL_QUEUES_ONLY" = "true" ]; then
  exec python "$manager_dir/backfill_model_work.py"
fi

export GH_TOKEN="$GITHUB_TOKEN"

# $1 = event key (pull_request|issue), $2 = number
organize() {
  case "$2" in
    ''|*[!0-9]*) echo "Skipping invalid number: $2"; return 0 ;;
  esac
  if [ "$1" = pull_request ]; then
    event=$(gh api "repos/$GITHUB_REPOSITORY/pulls/$2" --jq '{pull_request: .}') || return 1
  else
    event=$(gh api "repos/$GITHUB_REPOSITORY/issues/$2" \
      --jq 'if .pull_request then error("#\(.number) is a pull request") else {issue: .} end') || return 1
  fi
  GITHUB_EVENT="$event" python "$manager_dir/project_manager.py"
}
prs="$PR_NUMBERS"
if [ -z "$PR_NUMBERS$ISSUE_NUMBERS" ]; then
  prs=$(gh pr list --repo "$GITHUB_REPOSITORY" --state open --limit 1000 --json number --jq '.[].number')
fi
failed=0
for number in $prs; do organize pull_request "$number" || failed=$((failed + 1)); done
for number in $ISSUE_NUMBERS; do organize issue "$number" || failed=$((failed + 1)); done
echo "Failed items: $failed"
[ "$failed" -eq 0 ]
