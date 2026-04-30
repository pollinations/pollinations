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

source "$SCRIPT_DIR/_log.sh"
source "$SCRIPT_DIR/_pr-deploy.sh"

REPO="pollinations/pollinations"
TEXT_SOPS="$REPO_ROOT/gen.pollinations.ai/secrets/env.json"
API_BASE="https://api.perplexity.ai"
DEPLOY_WORKFLOW="deploy-enter-services.yml"
GEN_BASE="https://gen.pollinations.ai"
TESTING_TOKENS_FILE="$REPO_ROOT/enter.pollinations.ai/.testingtokens"
HEALTH_MODEL="perplexity-fast"
HEALTH_EXPECT="perplexity-ai"  # substring expected in .provider or .model

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

if [ ! -f "$TESTING_TOKENS_FILE" ]; then
    error "Required for provider-specific health check: $TESTING_TOKENS_FILE"
    error "  Copy from 1Password 'Pollinations Testing Tokens' or ask a maintainer."
    exit 1
fi
TEST_TOKEN=$(grep -E '^ENTER_API_TOKEN_REMOTE=' "$TESTING_TOKENS_FILE" | head -1 | cut -d= -f2- | tr -d '"')
if [ -z "$TEST_TOKEN" ]; then
    error "ENTER_API_TOKEN_REMOTE missing from $TESTING_TOKENS_FILE"
    exit 1
fi

OLD_KEY=$(sops -d "$TEXT_SOPS" | jq -r '.PERPLEXITY_API_KEY')
if [ -z "$OLD_KEY" ] || [ "$OLD_KEY" = "null" ]; then
    error "Could not read PERPLEXITY_API_KEY from SOPS."
    exit 1
fi
log "Current key: ${OLD_KEY:0:4}..."

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
    echo "  2. Update SOPS: gen.pollinations.ai/env.json"
    echo "  3. Verify new key via /chat/completions"
    echo "  4. Open PR: rotate/perplexity-<date> → main, auto-merge"
    echo "  5. Push main → production (admin)"
    echo "  6. Watch $DEPLOY_WORKFLOW"
    echo "  7. Health check via $GEN_BASE/v1/chat/completions (model=$HEALTH_MODEL → expect '$HEALTH_EXPECT')"
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
log "New key: ${NEW_KEY:0:4}..."

#######################################
# 2. Update SOPS
#######################################
section "Updating SOPS"

sops --set "[\"PERPLEXITY_API_KEY\"] $(printf '%s' "$NEW_KEY" | jq -Rs .)" "$TEXT_SOPS"
log "  gen.pollinations.ai/env.json updated"

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
# 4. PR + deploy
#######################################
section "Opening PR and deploying"

BRANCH="rotate/perplexity-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "$TEXT_SOPS"
git commit -m "rotate: Perplexity API key"

open_pr_and_merge "$BRANCH" \
    "rotate: Perplexity API key" \
    "Rotates \`PERPLEXITY_API_KEY\`. Old key stays valid until this PR merges, production is promoted, services are redeployed, and health check passes. Automated by \`rotate-genai-perplexity.sh\`." \
    || exit 1

push_prod_and_watch "$DEPLOY_WORKFLOW" || {
    error "Deploy workflow failed. Old key NOT revoked — resolve manually."
    exit 1
}

#######################################
# 8. Health check (provider-specific)
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
    error "Old key NOT revoked — resolve manually."
    exit 1
fi
HC_PROVIDER=$(echo "$HC_BODY" | jq -r '.provider // ""')
HC_MODEL=$(echo "$HC_BODY" | jq -r '.model // ""')
if ! echo "$HC_PROVIDER $HC_MODEL" | grep -qiE "$HEALTH_EXPECT"; then
    error "Health check: routing mismatch. provider='$HC_PROVIDER' model='$HC_MODEL' (expected substring '$HEALTH_EXPECT')."
    error "Old key NOT revoked — resolve manually."
    exit 1
fi
log "Health check OK: provider='$HC_PROVIDER' model='$HC_MODEL'"

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
log "Old key: ${OLD_KEY:0:4}... (revoked)"
log "New key: ${NEW_KEY:0:4}..."
echo ""
log "SOPS + production gen worker now using the new key."
