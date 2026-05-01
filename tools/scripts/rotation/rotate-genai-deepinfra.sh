#!/bin/bash
# Rotate DEEPINFRA_API_KEY using the DeepInfra API token endpoint.
#
# Usage: ./rotate-genai-deepinfra.sh [--execute]
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
API_BASE="https://api.deepinfra.com"
DEPLOY_WORKFLOW="deploy-gen-cloudflare.yml"
GEN_BASE="https://gen.pollinations.ai"
TESTING_TOKENS_FILE="$REPO_ROOT/enter.pollinations.ai/.testingtokens"
HEALTH_MODEL="deepseek"
HEALTH_EXPECT="DeepSeek-V4-Flash"

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

OLD_KEY=$(sops -d "$TEXT_SOPS" | jq -r '.DEEPINFRA_API_KEY')
if [ -z "$OLD_KEY" ] || [ "$OLD_KEY" = "null" ]; then
    error "Could not read DEEPINFRA_API_KEY from SOPS."
    exit 1
fi
log "Current key: ${OLD_KEY:0:4}..."

STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 30 \
    -X POST "$API_BASE/v1/openai/chat/completions" \
    -H "Authorization: Bearer $OLD_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"deepseek-ai/DeepSeek-V4-Flash","messages":[{"role":"user","content":"ping"}],"max_tokens":1}')
if [ "$STATUS" != "200" ]; then
    error "Current DeepInfra key invalid (HTTP $STATUS)."
    exit 1
fi
log "Current key valid (HTTP 200)"

log "Pre-flight OK"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
    echo
    log "Plan:"
    echo "  1. Create new DeepInfra key via /v1/api-tokens (old stays valid)"
    echo "  2. Update SOPS: gen.pollinations.ai/env.json"
    echo "  3. Verify new key via /v1/openai/chat/completions"
    echo "  4. Open PR: rotate/deepinfra-<date> → main, auto-merge"
    echo "  5. Push main → production (admin)"
    echo "  6. Watch $DEPLOY_WORKFLOW"
    echo "  7. Health check via $GEN_BASE/v1/chat/completions (model=$HEALTH_MODEL → expect '$HEALTH_EXPECT')"
    echo "  8. Delete old DeepInfra key"
    exit 0
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

#######################################
# 1. Locate old token ID
#######################################
section "Locating old DeepInfra token"

LIST_RESPONSE=$(curl -sS --fail-with-body \
    --url "$API_BASE/v1/api-tokens" \
    --header "Authorization: Bearer $OLD_KEY") || {
    error "Failed to list DeepInfra tokens: $LIST_RESPONSE"
    exit 1
}

OLD_TOKEN_ID=$(echo "$LIST_RESPONSE" | jq -r \
    --arg key "$OLD_KEY" \
    '.[] | select(.token == $key) | .token_id // .token' | head -1)

if [ -z "$OLD_TOKEN_ID" ] || [ "$OLD_TOKEN_ID" = "null" ]; then
    warn "Could not find token_id for old key — deletion will try the token value."
    OLD_TOKEN_ID="$OLD_KEY"
else
    log "Old token ID: $OLD_TOKEN_ID"
fi

#######################################
# 2. Create new key
#######################################
section "Creating new DeepInfra API key"

CREATE_RESPONSE=$(curl -sS --fail-with-body \
    --request POST \
    --url "$API_BASE/v1/api-tokens" \
    --header "Authorization: Bearer $OLD_KEY" \
    --header "Content-Type: application/json" \
    --data '{"name":"rotated-'"$(date +%Y%m%d-%H%M%S)"'"}') || {
    error "Failed to create new DeepInfra key: $CREATE_RESPONSE"
    exit 1
}

NEW_KEY=$(echo "$CREATE_RESPONSE" | jq -r '.token')
if [ -z "$NEW_KEY" ] || [ "$NEW_KEY" = "null" ]; then
    error "No token in response: $CREATE_RESPONSE"
    exit 1
fi
log "New key: ${NEW_KEY:0:4}..."

#######################################
# 3. Update SOPS
#######################################
section "Updating SOPS"

sops --set "[\"DEEPINFRA_API_KEY\"] $(printf '%s' "$NEW_KEY" | jq -Rs .)" "$TEXT_SOPS"
log "  gen.pollinations.ai/env.json updated"

#######################################
# 4. Verify new key
#######################################
section "Verifying new key"

VERIFY=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 30 \
    -X POST "$API_BASE/v1/openai/chat/completions" \
    -H "Authorization: Bearer $NEW_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"deepseek-ai/DeepSeek-V4-Flash","messages":[{"role":"user","content":"ping"}],"max_tokens":1}')
if [ "$VERIFY" != "200" ]; then
    error "New key verification failed (HTTP $VERIFY). Old key NOT deleted — resolve manually."
    exit 1
fi
log "New key verified (HTTP 200)."

#######################################
# 5. PR + deploy
#######################################
section "Opening PR and deploying"

BRANCH="rotate/deepinfra-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "$TEXT_SOPS"
git commit -m "rotate: DeepInfra API key"

open_pr_and_merge "$BRANCH" \
    "rotate: DeepInfra API key" \
    "Rotates \`DEEPINFRA_API_KEY\`. Old key stays valid until this PR merges, production is promoted, services are redeployed, and health check passes. Automated by \`rotate-genai-deepinfra.sh\`." \
    || exit 1

push_prod_and_watch "$DEPLOY_WORKFLOW" || {
    error "Deploy workflow failed. Old key NOT deleted — resolve manually."
    exit 1
}

#######################################
# 6. Health check (provider-specific)
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
# 7. Delete old key
#######################################
section "Deleting old DeepInfra key"

DELETE=$(curl -sS -o /dev/null -w "%{http_code}" \
    --request DELETE \
    --url "$API_BASE/v1/api-tokens/$OLD_TOKEN_ID" \
    --header "Authorization: Bearer $NEW_KEY")
if [ "$DELETE" = "200" ]; then
    log "Old key deleted."
else
    warn "Delete returned HTTP $DELETE — check manually."
fi

#######################################
# 8. Restore original branch
#######################################
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout main

section "DeepInfra Key Rotation Complete"
echo ""
log "Old key: ${OLD_KEY:0:4}... (deleted if HTTP 200 above)"
log "New key: ${NEW_KEY:0:4}..."
echo ""
log "SOPS + production gen worker now using the new key."
