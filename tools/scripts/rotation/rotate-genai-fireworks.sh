#!/bin/bash
# Rotate FIREWORKS_API_KEY using the Fireworks AI key management API.
#
# Usage: ./rotate-genai-fireworks.sh [--execute]
#
# Default: dry-run. Pass --execute for the full end-to-end cycle.
#
# Environment (from secrets.vars.json):
#   FIREWORKS_ACCOUNT_ID — Fireworks account ID
#   FIREWORKS_USER_ID    — Fireworks user ID

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

TEXT_SOPS="$REPO_ROOT/text.pollinations.ai/secrets/env.json"
API_BASE="https://api.fireworks.ai/v1"
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

if [ -z "$FIREWORKS_ACCOUNT_ID" ] || [ -z "$FIREWORKS_USER_ID" ]; then
    error "FIREWORKS_ACCOUNT_ID and FIREWORKS_USER_ID must be set (in secrets.vars.json or env)."
    exit 1
fi
log "Account: $FIREWORKS_ACCOUNT_ID / User: $FIREWORKS_USER_ID"

KEYS_URL="$API_BASE/accounts/$FIREWORKS_ACCOUNT_ID/users/$FIREWORKS_USER_ID/apiKeys"

if [ ! -f "$TEXT_SOPS" ]; then
    error "SOPS file not found: $TEXT_SOPS"
    exit 1
fi

OLD_KEY=$(sops -d "$TEXT_SOPS" | jq -r '.FIREWORKS_API_KEY')
if [ -z "$OLD_KEY" ] || [ "$OLD_KEY" = "null" ]; then
    error "Could not read FIREWORKS_API_KEY from SOPS."
    exit 1
fi
OLD_PREFIX="${OLD_KEY:0:8}"
log "Current key prefix: $OLD_PREFIX..."

STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
    "$KEYS_URL" -H "Authorization: Bearer $OLD_KEY")
if [ "$STATUS" != "200" ]; then
    error "Current Fireworks key invalid (HTTP $STATUS)."
    exit 1
fi
log "Current key valid (HTTP 200)"

log "Pre-flight OK"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
    echo
    log "Plan:"
    echo "  1. Create new Fireworks key (old stays valid)"
    echo "  2. Update SOPS: text.pollinations.ai/env.json"
    echo "  3. Verify new key can list apiKeys"
    echo "  4. Open PR: rotate/fireworks-<date> → main, auto-merge"
    echo "  5. Push main → production (admin)"
    echo "  6. Watch $DEPLOY_WORKFLOW"
    echo "  7. Health check $HEALTH_URL"
    echo "  8. Delete old key"
    exit 0
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

#######################################
# 1. Find old key ID (for later delete)
#######################################
section "Locating old key ID"

LIST_RESPONSE=$(curl -sS --fail-with-body \
    --url "$KEYS_URL" \
    --header "Authorization: Bearer $OLD_KEY") || {
    error "Failed to list keys: $LIST_RESPONSE"
    exit 1
}

OLD_KEY_ID=$(echo "$LIST_RESPONSE" | jq -r \
    --arg prefix "$OLD_PREFIX" \
    '.apiKeys[] | select(.prefix | startswith($prefix)) | .keyId' | head -1)

if [ -z "$OLD_KEY_ID" ]; then
    warn "Could not find keyId for prefix $OLD_PREFIX — old key won't be auto-deleted."
else
    log "Old key ID: $OLD_KEY_ID"
fi

#######################################
# 2. Create new key
#######################################
section "Creating new Fireworks API key"

CREATE_RESPONSE=$(curl -sS --fail-with-body \
    --request POST \
    --url "$KEYS_URL" \
    --header "Authorization: Bearer $OLD_KEY" \
    --header "Content-Type: application/json" \
    --data '{"apiKey":{"displayName":"rotated-'"$(date +%Y%m%d-%H%M%S)"'"}}') || {
    error "Failed to create new key: $CREATE_RESPONSE"
    exit 1
}

NEW_KEY=$(echo "$CREATE_RESPONSE" | jq -r '.key')
if [ -z "$NEW_KEY" ] || [ "$NEW_KEY" = "null" ]; then
    error "No key in response: $CREATE_RESPONSE"
    exit 1
fi
log "New key: ${NEW_KEY:0:8}..."

#######################################
# 3. Update SOPS
#######################################
section "Updating SOPS"

sops --set "[\"FIREWORKS_API_KEY\"] \"$NEW_KEY\"" "$TEXT_SOPS"
log "  text.pollinations.ai/env.json updated"

#######################################
# 4. Verify new key
#######################################
section "Verifying new key"

VERIFY=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
    "$KEYS_URL" -H "Authorization: Bearer $NEW_KEY")
if [ "$VERIFY" != "200" ]; then
    error "New key verification failed (HTTP $VERIFY). Old key NOT deleted."
    exit 1
fi
log "New key verified (HTTP 200)."

#######################################
# 5. Open PR to main, auto-merge
#######################################
section "Opening PR to main"

BRANCH="rotate/fireworks-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "$TEXT_SOPS"
git commit -m "rotate: Fireworks API key"
git push -u origin "$BRANCH"

gh pr create \
    --base main \
    --head "$BRANCH" \
    --title "rotate: Fireworks API key" \
    --body "Rotates \`FIREWORKS_API_KEY\`. Old key stays valid until this PR merges, production is promoted, services are redeployed, and health check passes. Automated by \`rotate-genai-fireworks.sh\`."

log "Enabling auto-merge..."
gh pr merge "$BRANCH" --auto --squash

#######################################
# 6. Poll until PR merged
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
# 7. Push main → production
#######################################
section "Promoting main → production"

git checkout main
git pull --ff-only origin main
git fetch origin production
git push origin main:production
log "production advanced to main."

#######################################
# 8. Watch deploy workflow
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
# 9. Health check
#######################################
section "Health check"

STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 30 \
    -X POST "$HEALTH_URL" \
    -H "Content-Type: application/json" \
    -d '{"model":"qwen-large","messages":[{"role":"user","content":"ping"}],"max_tokens":1}')
if [ "$STATUS" != "200" ] && [ "$STATUS" != "401" ]; then
    error "Health check failed (HTTP $STATUS). Old key NOT deleted — resolve manually."
    exit 1
fi
log "Production endpoint reachable."

#######################################
# 10. Delete old key
#######################################
section "Deleting old Fireworks key"

if [ -n "$OLD_KEY_ID" ]; then
    DELETE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
        --request POST \
        --url "$KEYS_URL:delete" \
        --header "Authorization: Bearer $NEW_KEY" \
        --header "Content-Type: application/json" \
        --data "{\"keyId\": \"$OLD_KEY_ID\"}")
    if [ "$DELETE_RESPONSE" = "200" ]; then
        log "Old key deleted (ID: $OLD_KEY_ID)."
    else
        warn "Delete returned HTTP $DELETE_RESPONSE — check manually."
    fi
else
    warn "Skipping delete — old key ID not found."
fi

#######################################
# 11. Restore original branch
#######################################
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout main

section "Fireworks Key Rotation Complete"
echo ""
log "Old key: ${OLD_KEY:0:8}... (deleted)"
log "New key: ${NEW_KEY:0:8}..."
echo ""
log "SOPS + production + EC2 text service now using the new key."
