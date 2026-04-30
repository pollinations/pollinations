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

source "$SCRIPT_DIR/_log.sh"
source "$SCRIPT_DIR/_pr-deploy.sh"

source "$SCRIPT_DIR/_load-admin-secrets.sh"

REPO="pollinations/pollinations"
TEXT_SOPS="$REPO_ROOT/gen.pollinations.ai/secrets/env.json"
API_BASE="https://api.fireworks.ai/v1"
DEPLOY_WORKFLOW="deploy-enter-services.yml"
GEN_BASE="https://gen.pollinations.ai"
TESTING_TOKENS_FILE="$REPO_ROOT/enter.pollinations.ai/.testingtokens"
HEALTH_MODEL="kimi"
HEALTH_EXPECT="fireworks"  # substring expected in .provider or .model

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

if [ ! -f "$TESTING_TOKENS_FILE" ]; then
    error "Required for provider-specific health check: $TESTING_TOKENS_FILE"
    exit 1
fi
TEST_TOKEN=$(grep -E '^ENTER_API_TOKEN_REMOTE=' "$TESTING_TOKENS_FILE" | head -1 | cut -d= -f2- | tr -d '"')
if [ -z "$TEST_TOKEN" ]; then
    error "ENTER_API_TOKEN_REMOTE missing from $TESTING_TOKENS_FILE"
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
    echo "  2. Update SOPS: gen.pollinations.ai/env.json"
    echo "  3. Verify new key can list apiKeys"
    echo "  4. Open PR: rotate/fireworks-<date> → main, auto-merge"
    echo "  5. Push main → production (admin)"
    echo "  6. Watch $DEPLOY_WORKFLOW"
    echo "  7. Health check via $GEN_BASE/v1/chat/completions (model=$HEALTH_MODEL → expect '$HEALTH_EXPECT')"
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
log "New key: ${NEW_KEY:0:4}..."

#######################################
# 3. Update SOPS
#######################################
section "Updating SOPS"

sops --set "[\"FIREWORKS_API_KEY\"] $(printf '%s' "$NEW_KEY" | jq -Rs .)" "$TEXT_SOPS"
log "  gen.pollinations.ai/env.json updated"

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
# 5. PR + deploy
#######################################
section "Opening PR and deploying"

BRANCH="rotate/fireworks-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "$TEXT_SOPS"
git commit -m "rotate: Fireworks API key"

open_pr_and_merge "$BRANCH" \
    "rotate: Fireworks API key" \
    "Rotates \`FIREWORKS_API_KEY\`. Old key stays valid until this PR merges, production is promoted, services are redeployed, and health check passes. Automated by \`rotate-genai-fireworks.sh\`." \
    || exit 1

push_prod_and_watch "$DEPLOY_WORKFLOW" || {
    error "Deploy workflow failed. Old key NOT deleted — resolve manually."
    exit 1
}

#######################################
# 9. Health check (provider-specific)
#######################################
section "Health check ($HEALTH_MODEL → expect '$HEALTH_EXPECT')"

HC_BODY=$(curl -sS --max-time 60 \
    -X POST "$GEN_BASE/v1/chat/completions" \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$HEALTH_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"reply ok\"}],\"max_tokens\":10}")
HC_ERR=$(echo "$HC_BODY" | jq -r '.error.message // ""')
if [ -n "$HC_ERR" ]; then
    error "Health check failed: $HC_ERR"
    error "Body: $HC_BODY"
    error "Old key NOT deleted — resolve manually."
    exit 1
fi
HC_PROVIDER=$(echo "$HC_BODY" | jq -r '.provider // ""')
HC_MODEL=$(echo "$HC_BODY" | jq -r '.model // ""')
if ! echo "$HC_PROVIDER $HC_MODEL" | grep -qiE "$HEALTH_EXPECT"; then
    error "Health check: routing mismatch. provider='$HC_PROVIDER' model='$HC_MODEL' (expected substring '$HEALTH_EXPECT')."
    error "Old key NOT deleted — resolve manually."
    exit 1
fi
log "Health check OK: provider='$HC_PROVIDER' model='$HC_MODEL'"

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
log "Old key: ${OLD_KEY:0:4}... (deleted)"
log "New key: ${NEW_KEY:0:4}..."
echo ""
log "SOPS + production gen worker now using the new key."
