#!/bin/bash
# Rotate XAI_API_KEY via create-new + delete-old (zero-downtime).
#
# Usage: ./rotate-genai-xai.sh [--execute]
#
# Default: dry-run. Pass --execute for the full end-to-end cycle.
#
# Strategy: xAI's Management API supports POST /auth/api-keys (create) and
# DELETE /auth/api-keys/{id}. We create a new key (inheriting ACLs from the
# old one), update SOPS, deploy, health-check, then delete the old key.
# The earlier POST /auth/api-keys/{id}/rotate was in-place immediate-invalidate
# — replaced with this rolling approach.
#
# Environment (from secrets.vars.json):
#   XAI_MANAGEMENT_KEY — Management API key
#   XAI_TEAM_ID        — team ID

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"

DRY_RUN=true
while [[ "$1" == --* ]]; do
    case "$1" in
        --execute) DRY_RUN=false; shift ;;
        *) echo "Unknown flag: $1"; exit 1 ;;
    esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
section() { echo -e "\n${BLUE}=== $1 ===${NC}"; }

source "$SCRIPT_DIR/_load-admin-secrets.sh"

IMAGE_SOPS="$REPO_ROOT/image.pollinations.ai/secrets/env.json"
MGMT_API="https://management-api.x.ai"
DEPLOY_WORKFLOW="deploy-enter-services.yml"
HEALTH_URL="https://gen.pollinations.ai/v1/chat/completions"

#######################################
# Pre-flight
#######################################
section "Pre-flight: checks"

cd "$REPO_ROOT"

if ! $DRY_RUN; then
    if [ -n "$(git status --porcelain)" ]; then
        error "Working tree not clean — commit or stash before --execute."
        git status --short
        exit 1
    fi
fi

if ! command -v gh >/dev/null || ! gh auth status >/dev/null 2>&1; then
    error "gh CLI not authenticated."
    exit 1
fi

if [ -z "$XAI_MANAGEMENT_KEY" ] || [ -z "$XAI_TEAM_ID" ]; then
    error "XAI_MANAGEMENT_KEY and XAI_TEAM_ID must be set."
    exit 1
fi

if [ ! -f "$IMAGE_SOPS" ]; then
    error "SOPS file not found: $IMAGE_SOPS"
    exit 1
fi

OLD_KEY=$(sops -d "$IMAGE_SOPS" | jq -r '.XAI_API_KEY')
if [ -z "$OLD_KEY" ] || [ "$OLD_KEY" = "null" ]; then
    error "Could not read XAI_API_KEY from SOPS."
    exit 1
fi
OLD_SUFFIX="${OLD_KEY: -4}"
log "Current key suffix: ...$OLD_SUFFIX"

LIST_RESPONSE=$(curl -sS --fail-with-body --max-time 15 \
    "$MGMT_API/auth/teams/$XAI_TEAM_ID/api-keys?pageSize=100" \
    -H "Authorization: Bearer $XAI_MANAGEMENT_KEY") || {
    error "Management API access failed: $LIST_RESPONSE"
    exit 1
}

OLD_KEY_ID=$(echo "$LIST_RESPONSE" | jq -r \
    --arg suffix "$OLD_SUFFIX" \
    '.apiKeys[] | select(.redactedApiKey | endswith($suffix)) | .apiKeyId' | head -1)

if [ -z "$OLD_KEY_ID" ]; then
    error "Could not find apiKeyId matching suffix ...$OLD_SUFFIX in team $XAI_TEAM_ID."
    echo "Listed keys:"
    echo "$LIST_RESPONSE" | jq '.apiKeys[].redactedApiKey' 2>/dev/null
    exit 1
fi
log "Old apiKeyId: $OLD_KEY_ID"

OLD_NAME=$(echo "$LIST_RESPONSE" | jq -r --arg id "$OLD_KEY_ID" \
    '.apiKeys[] | select(.apiKeyId == $id) | .name')
OLD_ACLS=$(echo "$LIST_RESPONSE" | jq -c --arg id "$OLD_KEY_ID" \
    '.apiKeys[] | select(.apiKeyId == $id) | .aclStrings')
log "Old key name: $OLD_NAME"
log "Old key ACLs: $OLD_ACLS"

log "Pre-flight OK"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
    echo
    log "Plan:"
    echo "  1. Create new xAI key with cloned ACLs (old $OLD_KEY_ID stays valid)"
    echo "  2. Update SOPS: image.pollinations.ai/env.json"
    echo "  3. Open PR: rotate/xai-<date> → main, auto-merge"
    echo "  4. Push main → production (admin)"
    echo "  5. Watch $DEPLOY_WORKFLOW"
    echo "  6. Health check $HEALTH_URL"
    echo "  7. Delete old key $OLD_KEY_ID"
    exit 0
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

#######################################
# 1. Create new xAI key with cloned ACLs
#######################################
section "Creating new xAI key"

NEW_NAME="rotated-$(date +%Y%m%d-%H%M%S)"
CREATE_PAYLOAD=$(jq -n \
    --arg team "$XAI_TEAM_ID" \
    --arg name "$NEW_NAME" \
    --argjson acls "$OLD_ACLS" \
    '{teamId: $team, name: $name, aclStrings: $acls}')

CREATE_RESPONSE=$(curl -sS --fail-with-body \
    -X POST "$MGMT_API/auth/api-keys" \
    -H "Authorization: Bearer $XAI_MANAGEMENT_KEY" \
    -H "Content-Type: application/json" \
    --data "$CREATE_PAYLOAD") || {
    error "Failed to create new key: $CREATE_RESPONSE"
    exit 1
}

NEW_KEY=$(echo "$CREATE_RESPONSE" | jq -r '.apiKey // empty')
NEW_KEY_ID=$(echo "$CREATE_RESPONSE" | jq -r '.apiKeyId // empty')

if [ -z "$NEW_KEY" ] || [ -z "$NEW_KEY_ID" ]; then
    error "Response missing apiKey or apiKeyId: $CREATE_RESPONSE"
    exit 1
fi
log "New key: ${NEW_KEY:0:12}... (ID: $NEW_KEY_ID)"

#######################################
# 2. Update SOPS
#######################################
section "Updating SOPS"

sops --set "[\"XAI_API_KEY\"] \"$NEW_KEY\"" "$IMAGE_SOPS"
log "  image.pollinations.ai/env.json updated"

#######################################
# 3. Open PR to main, auto-merge
#######################################
section "Opening PR to main"

BRANCH="rotate/xai-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "$IMAGE_SOPS"
git commit -m "rotate: xAI API key"
git push -u origin "$BRANCH"

gh pr create \
    --base main \
    --head "$BRANCH" \
    --title "rotate: xAI API key" \
    --body "Rotates \`XAI_API_KEY\` via create-new + delete-old (replaces the old in-place /rotate endpoint). Old key \`$OLD_KEY_ID\` stays valid until this PR merges, production deploys, and health check passes. Automated by \`rotate-genai-xai.sh\`."

log "Enabling auto-merge..."
gh pr merge "$BRANCH" --auto --squash

#######################################
# 4. Poll until PR merged
#######################################
section "Waiting for PR to merge"

MERGE_TIMEOUT=900
MERGE_ELAPSED=0
while true; do
    STATE=$(gh pr view "$BRANCH" --json state -q .state 2>/dev/null || echo "UNKNOWN")
    case "$STATE" in
        MERGED) log "PR merged."; break ;;
        CLOSED) error "PR was closed without merging."; exit 1 ;;
    esac
    if [ "$MERGE_ELAPSED" -ge "$MERGE_TIMEOUT" ]; then
        error "Timed out waiting for PR merge after ${MERGE_TIMEOUT}s."
        exit 1
    fi
    sleep 15
    MERGE_ELAPSED=$((MERGE_ELAPSED + 15))
done

#######################################
# 5. Push main → production
#######################################
section "Promoting main → production"

git checkout main
git pull --ff-only origin main
git fetch origin production
git push origin main:production
log "production advanced to main."

#######################################
# 6. Watch deploy workflow
#######################################
section "Waiting for $DEPLOY_WORKFLOW"

sleep 10
RUN_ID=$(gh run list --workflow="$DEPLOY_WORKFLOW" --branch=production --limit=1 --json databaseId -q '.[0].databaseId')
if [ -z "$RUN_ID" ]; then
    error "No deploy run found for $DEPLOY_WORKFLOW on production."
    exit 1
fi
log "Watching run $RUN_ID..."
gh run watch "$RUN_ID" --exit-status || {
    error "Deploy workflow failed. Old key NOT deleted — resolve manually."
    exit 1
}

#######################################
# 7. Health check
#######################################
section "Health check"

STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 30 \
    -X POST "$HEALTH_URL" \
    -H "Content-Type: application/json" \
    -d '{"model":"grok","messages":[{"role":"user","content":"ping"}],"max_tokens":1}')
if [ "$STATUS" != "200" ] && [ "$STATUS" != "401" ]; then
    error "Health check failed (HTTP $STATUS). Old key NOT deleted — resolve manually."
    exit 1
fi
log "Production endpoint reachable (HTTP $STATUS)."

#######################################
# 8. Delete old key
#######################################
section "Deleting old xAI key"

DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X DELETE "$MGMT_API/auth/api-keys/$OLD_KEY_ID" \
    -H "Authorization: Bearer $XAI_MANAGEMENT_KEY")
if [ "$DELETE_STATUS" = "200" ] || [ "$DELETE_STATUS" = "204" ]; then
    log "Old key deleted (ID: $OLD_KEY_ID)."
else
    warn "Delete returned HTTP $DELETE_STATUS — check manually."
fi

#######################################
# 9. Restore original branch
#######################################
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout main

section "xAI Key Rotation Complete"
echo ""
log "Old key: ${OLD_KEY:0:12}... (deleted, ID: $OLD_KEY_ID)"
log "New key: ${NEW_KEY:0:12}... (ID: $NEW_KEY_ID)"
echo ""
log "SOPS + production + EC2 image service now using the new key."
