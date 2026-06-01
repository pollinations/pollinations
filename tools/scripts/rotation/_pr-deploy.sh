#!/bin/bash
# Shared PR + deploy helpers for rotation scripts. Sourced, not executed.
#
# Depends on: _log.sh (log, error). Requires caller to set $REPO.

# Push branch, open PR to main, enable auto-merge, poll until MERGED.
# Caller must have already: git checkout -b "$branch", git add, git commit.
# Returns 0 on merge, 1 on close or timeout.
#
# Usage:
#   open_pr_and_merge <branch> <title> <body>
open_pr_and_merge() {
    local branch="$1"
    local title="$2"
    local body="$3"

    git push -u origin "$branch"
    gh pr create --repo "$REPO" --base main --head "$branch" --title "$title" --body "$body"
    log "Enabling auto-merge..."
    gh pr merge "$branch" --repo "$REPO" --auto --squash

    local timeout=900 elapsed=0 state
    log "Waiting for PR to merge..."
    while :; do
        state=$(gh pr view "$branch" --repo "$REPO" --json state -q .state 2>/dev/null || echo "UNKNOWN")
        case "$state" in
            MERGED) log "PR merged."; return 0 ;;
            CLOSED) error "PR $branch closed without merging."; return 1 ;;
        esac
        if [ "$elapsed" -ge "$timeout" ]; then
            error "Timed out waiting for $branch to merge (${timeout}s)."
            return 1
        fi
        sleep 15; elapsed=$((elapsed + 15))
    done
}

# Advance origin/production to main, watch the named workflow run for the new
# commit until it finishes. Exports PROD_SHA as a side effect.
#
# Usage:
#   push_prod_and_watch <deploy-workflow>
push_prod_and_watch() {
    local workflow="$1"

    git checkout main
    git pull --ff-only origin main
    PROD_SHA=$(git rev-parse main)
    git fetch origin production
    git push origin main:production
    log "production advanced to main ($PROD_SHA)."

    log "Waiting for $workflow..."
    local run_id=""
    for _ in $(seq 1 12); do
        sleep 10
        run_id=$(gh run list --workflow="$workflow" --branch=production --commit="$PROD_SHA" --limit=1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)
        [ -n "$run_id" ] && break
    done
    if [ -z "$run_id" ]; then
        error "No deploy run found for $workflow on production at $PROD_SHA."
        return 1
    fi
    log "Watching run $run_id..."
    gh run watch "$run_id" --exit-status
}
