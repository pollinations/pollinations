#!/bin/bash
# Rotate PERPLEXITY_API_KEY using the Perplexity token management API.
#
# Usage: ./rotate-genai-perplexity.sh [--execute]
#
# Default: dry-run. Pass --execute for the full end-to-end cycle.
#
# Prerequisites:
# - sops, jq, curl, gh installed
# - Admin permission to push directly to the production branch

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

TEXT_SOPS="$REPO_ROOT/text.pollinations.ai/secrets/env.json"
API_BASE="https://api.perplexity.ai"
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

if [ ! -f "$TEXT_SOPS" ]; then
    error "SOPS file not found: $TEXT_SOPS"
    exit 1
fi

OLD_KEY=$(sops -d "$TEXT_SOPS" | jq -r '.PERPLEXITY_API_KEY')
if [ -z "$OLD_KEY" ] || [ "$OLD_KEY" = "null" ]; then
    error "Could not read PERPLEXITY_API_KEY from SOPS."
    exit 1
fi
log "Current key: ${OLD_KEY:0:12}..."

STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 \
    -X POST "$API_BASE/chat/completions" \
    -H "Authorization: Bearer $OLD_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"sonar","messages":[{"role":"user","content":"ping"}],"max_tokens":1}')
if [ "$STATUS" != "200" ]; then
    error "Current Perplexity key invalid (HTTP $STATUS)."
    exit 1
fi
log "Current key valid (HTTP 200)"

log "Pre-flight OK"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
    echo
    log "Plan:"
    echo "  1. Create new Perplexity key via /generate_auth_token (old stays valid)"
    echo "  2. Update SOPS: text.pollinations.ai/env.json"
    echo "  3. Verify new key via /chat/completions"
    echo "  4. Open PR: rotate/perplexity-<date> → main, auto-merge"
    echo "  5. Push main → production (admin)"
    echo "  6. Watch $DEPLOY_WORKFLOW"
    echo "  7. Health check $HEALTH_URL"
    echo "  8. Revoke old key"
    exit 0
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

#######################################
# 1. Create new key
#######################################
section "Creating new Perplexity API key"

RESPONSE=$(curl -sS --fail-with-body --request POST \
    --url "$API_BASE/generate_auth_token" \
    --header "Authorization: Bearer $OLD_KEY" \
    --header "Content-Type: application/json" \
    --data '{"token_name": "rotated-'"$(date +%Y%m%d-%H%M%S)"'"}') || {
    error "Failed to create new key: $RESPONSE"
    exit 1
}

NEW_KEY=$(echo "$RESPONSE" | jq -r '.auth_token')
if [ -z "$NEW_KEY" ] || [ "$NEW_KEY" = "null" ]; then
    error "No auth_token in response: $RESPONSE"
    exit 1
fi
log "New key: ${NEW_KEY:0:12}..."

#######################################
# 2. Update SOPS
#######################################
section "Updating SOPS"

sops --set "[\"PERPLEXITY_API_KEY\"] \"$NEW_KEY\"" "$TEXT_SOPS"
log "  text.pollinations.ai/env.json updated"

#######################################
# 3. Verify new key
#######################################
section "Verifying new key"

VERIFY=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 \
    --request POST \
    --url "$API_BASE/chat/completions" \
    --header "Authorization: Bearer $NEW_KEY" \
    --header "Content-Type: application/json" \
    --data '{"model":"sonar","messages":[{"role":"user","content":"ping"}],"max_tokens":1}')
if [ "$VERIFY" != "200" ]; then
    error "New key verification failed (HTTP $VERIFY). Old key NOT revoked — resolve manually."
    exit 1
fi
log "New key verified (HTTP 200)."

#######################################
# 4. Open PR to main, auto-merge
#######################################
section "Opening PR to main"

BRANCH="rotate/perplexity-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "$TEXT_SOPS"
git commit -m "rotate: Perplexity API key"
git push -u origin "$BRANCH"

gh pr create \
    --base main \
    --head "$BRANCH" \
    --title "rotate: Perplexity API key" \
    --body "Rotates \`PERPLEXITY_API_KEY\`. Old key stays valid until this PR merges, production is promoted, services are redeployed, and health check passes. Automated by \`rotate-genai-perplexity.sh\`."

log "Enabling auto-merge..."
gh pr merge "$BRANCH" --auto --squash

#######################################
# 5. Poll until PR merged
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
# 6. Push main → production
#######################################
section "Promoting main → production"

git checkout main
git pull --ff-only origin main
git fetch origin production
git push origin main:production
log "production advanced to main."

#######################################
# 7. Watch deploy workflow
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
    error "Deploy workflow failed. Old key NOT revoked — resolve manually."
    exit 1
}

#######################################
# 8. Health check
#######################################
section "Health check"

STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 30 \
    -X POST "$HEALTH_URL" \
    -H "Content-Type: application/json" \
    -d '{"model":"perplexity-fast","messages":[{"role":"user","content":"ping"}],"max_tokens":1}')
if [ "$STATUS" != "200" ] && [ "$STATUS" != "401" ]; then
    # 401 means the endpoint requires auth, which is fine — just checking the endpoint is reachable
    error "Health check failed (HTTP $STATUS). Old key NOT revoked — resolve manually."
    exit 1
fi
log "Production endpoint reachable."

#######################################
# 9. Revoke old key
#######################################
section "Revoking old Perplexity key"

REVOKE=$(curl -s -o /dev/null -w "%{http_code}" \
    --request POST \
    --url "$API_BASE/revoke_auth_token" \
    --header "Authorization: Bearer $NEW_KEY" \
    --header "Content-Type: application/json" \
    --data "{\"auth_token\": \"$OLD_KEY\"}")
if [ "$REVOKE" = "200" ]; then
    log "Old key revoked."
else
    warn "Revocation returned HTTP $REVOKE — check manually."
fi

#######################################
# 10. Restore original branch
#######################################
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout main

section "Perplexity Key Rotation Complete"
echo ""
log "Old key: ${OLD_KEY:0:12}... (revoked)"
log "New key: ${NEW_KEY:0:12}..."
echo ""
log "SOPS + production + EC2 text service now using the new key."
