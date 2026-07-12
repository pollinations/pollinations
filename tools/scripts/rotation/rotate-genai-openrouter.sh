#!/bin/bash
# Rotate OPENROUTER_API_KEY using the OpenRouter Management API.
#
# Usage: ./rotate-genai-openrouter.sh [--execute]
#
# Default: dry-run. Pass --execute for the full end-to-end cycle.
#
# Environment (from tools/scripts/rotation/secrets.vars.json or shell):
#   OPENROUTER_MANAGEMENT_API_KEY — OpenRouter management key
#   OPENROUTER_KEY_LIMIT          — optional new runtime key credit limit
#   OPENROUTER_ROTATION_TEST_MODEL — optional model for direct key verification

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
GEN_SOPS_FILES=(
    "$REPO_ROOT/gen.pollinations.ai/secrets/dev.vars.json"
    "$REPO_ROOT/gen.pollinations.ai/secrets/staging.vars.json"
    "$REPO_ROOT/gen.pollinations.ai/secrets/prod.vars.json"
)
GEN_SOPS_READ="${GEN_SOPS_FILES[0]}"
API_BASE="https://openrouter.ai/api/v1"
DEPLOY_WORKFLOW="deploy-gen-cloudflare.yml"
VERIFY_MODEL="${OPENROUTER_ROTATION_TEST_MODEL:-qwen/qwen3.6-plus}"

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

if [ -z "$OPENROUTER_MANAGEMENT_API_KEY" ]; then
    error "OPENROUTER_MANAGEMENT_API_KEY must be set."
    exit 1
fi

for f in "${GEN_SOPS_FILES[@]}"; do
    if [ ! -f "$f" ]; then
        error "SOPS file not found: $f"
        exit 1
    fi
done

OLD_KEY=$(sops -d "$GEN_SOPS_READ" | jq -r '.OPENROUTER_API_KEY')
if [ -z "$OLD_KEY" ] || [ "$OLD_KEY" = "null" ]; then
    error "Could not read OPENROUTER_API_KEY from SOPS."
    exit 1
fi
log "Current key: ${OLD_KEY:0:10}..."

CURRENT_KEY_RESPONSE=$(curl -sS --fail-with-body --max-time 30 \
    "$API_BASE/key" \
    -H "Authorization: Bearer $OLD_KEY") || {
    error "Current OpenRouter key invalid: $CURRENT_KEY_RESPONSE"
    exit 1
}

OLD_LABEL=$(echo "$CURRENT_KEY_RESPONSE" | jq -r '.data.label // ""')
OLD_LIMIT=$(echo "$CURRENT_KEY_RESPONSE" | jq -r '.data.limit // empty')
OLD_LIMIT_RESET=$(echo "$CURRENT_KEY_RESPONSE" | jq -r '.data.limit_reset // empty')
OLD_INCLUDE_BYOK=$(echo "$CURRENT_KEY_RESPONSE" | jq -r '.data.include_byok_in_limit // false')
OLD_EXPIRES_AT=$(echo "$CURRENT_KEY_RESPONSE" | jq -r '.data.expires_at // empty')
if [ -z "$OLD_LABEL" ]; then
    error "Could not read current OpenRouter key label."
    exit 1
fi
log "Current key label: $OLD_LABEL"

KEYS_RESPONSE=$(curl -sS --fail-with-body --max-time 30 \
    "$API_BASE/keys?include_disabled=true" \
    -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_API_KEY") || {
    error "OpenRouter management key failed to list keys: $KEYS_RESPONSE"
    exit 1
}

MATCHING_HASHES=$(echo "$KEYS_RESPONSE" | jq -r --arg label "$OLD_LABEL" \
    '.data[] | select(.label == $label) | .hash')
MATCH_COUNT=$(echo "$MATCHING_HASHES" | grep -c . || true)
if [ "$MATCH_COUNT" -eq 0 ]; then
    error "Could not find old key hash for label '$OLD_LABEL'."
    exit 1
fi
if [ "$MATCH_COUNT" -gt 1 ]; then
    error "Multiple OpenRouter keys match label '$OLD_LABEL' — refusing to guess."
    echo "$KEYS_RESPONSE" | jq --arg label "$OLD_LABEL" \
        '.data[] | select(.label == $label) | {hash, name, label, disabled}'
    exit 1
fi
OLD_HASH="$MATCHING_HASHES"
log "Old key hash: $OLD_HASH"

log "Pre-flight OK"

NEW_LIMIT="${OPENROUTER_KEY_LIMIT:-$OLD_LIMIT}"
if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
    echo
    log "Plan:"
    echo "  1. Create new OpenRouter runtime key (old stays valid)"
    echo "  2. Update SOPS: gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json"
    echo "  3. Verify new key via /chat/completions"
    echo "  4. Open PR: rotate/openrouter-<date> → main, auto-merge"
    echo "  5. Push main → production (admin)"
    echo "  6. Watch $DEPLOY_WORKFLOW"
    echo "  7. Delete old key hash $OLD_HASH"
    exit 0
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

#######################################
# 1. Create new key
#######################################
section "Creating new OpenRouter API key"

CREATE_PAYLOAD=$(jq -n \
    --arg name "pollinations-gen-rotated-$(date +%Y%m%d-%H%M%S)" \
    --arg limit "$NEW_LIMIT" \
    --arg limitReset "$OLD_LIMIT_RESET" \
    --argjson includeByok "$OLD_INCLUDE_BYOK" \
    --arg expiresAt "$OLD_EXPIRES_AT" \
    '{
        name: $name,
        limit: (if $limit == "" then null else ($limit | tonumber) end),
        limit_reset: (if $limitReset == "" then null else $limitReset end),
        include_byok_in_limit: $includeByok
    } + (if $expiresAt == "" then {} else {expires_at: $expiresAt} end)')

CREATE_RESPONSE=$(curl -sS --fail-with-body \
    --request POST \
    --url "$API_BASE/keys" \
    --header "Authorization: Bearer $OPENROUTER_MANAGEMENT_API_KEY" \
    --header "Content-Type: application/json" \
    --data "$CREATE_PAYLOAD") || {
    error "Failed to create OpenRouter key: $CREATE_RESPONSE"
    exit 1
}

NEW_KEY=$(echo "$CREATE_RESPONSE" | jq -r '.key')
NEW_HASH=$(echo "$CREATE_RESPONSE" | jq -r '.data.hash')
if [ -z "$NEW_KEY" ] || [ "$NEW_KEY" = "null" ] || [ -z "$NEW_HASH" ] || [ "$NEW_HASH" = "null" ]; then
    error "Response missing key or hash: $CREATE_RESPONSE"
    exit 1
fi
log "New key: ${NEW_KEY:0:10}... (hash: $NEW_HASH)"

#######################################
# 2. Update SOPS
#######################################
section "Updating SOPS"

for f in "${GEN_SOPS_FILES[@]}"; do
    sops --set "[\"OPENROUTER_API_KEY\"] $(printf '%s' "$NEW_KEY" | jq -Rs .)" "$f"
    log "  $(basename "$f") updated"
done

#######################################
# 3. Verify new key
#######################################
section "Verifying new key"

VERIFY=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 60 \
    -X POST "$API_BASE/chat/completions" \
    -H "Authorization: Bearer $NEW_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$VERIFY_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"reply ok\"}],\"max_tokens\":8}")
if [ "$VERIFY" != "200" ]; then
    error "New key verification failed (HTTP $VERIFY). Old key NOT deleted."
    exit 1
fi
log "New key verified (HTTP 200)."

#######################################
# 4. PR + deploy
#######################################
section "Opening PR and deploying"

BRANCH="rotate/openrouter-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "${GEN_SOPS_FILES[@]}"
git commit -m "rotate: OpenRouter API key"

open_pr_and_merge "$BRANCH" \
    "rotate: OpenRouter API key" \
    "Rotates \`OPENROUTER_API_KEY\`. Old key stays valid until this PR merges, production is promoted, services are redeployed, and direct OpenRouter key verification passes. Automated by \`rotate-genai-openrouter.sh\`." \
    || exit 1

push_prod_and_watch "$DEPLOY_WORKFLOW" || {
    error "Deploy workflow failed. Old key NOT deleted — resolve manually."
    exit 1
}

#######################################
# 5. Delete old key
#######################################
section "Deleting old OpenRouter key"

DELETE=$(curl -sS -o /dev/null -w "%{http_code}" \
    --request DELETE \
    --url "$API_BASE/keys/$OLD_HASH" \
    --header "Authorization: Bearer $OPENROUTER_MANAGEMENT_API_KEY" \
    --header "Content-Type: application/json" \
    --data '{}')
if [ "$DELETE" = "200" ]; then
    log "Old key deleted."
else
    warn "Delete returned HTTP $DELETE — check manually."
fi

#######################################
# 6. Restore original branch
#######################################
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout main

section "OpenRouter Key Rotation Complete"
echo ""
log "Old key: ${OLD_KEY:0:10}... (deleted if HTTP 200 above)"
log "New key: ${NEW_KEY:0:10}... (hash: $NEW_HASH)"
echo ""
log "SOPS + production gen worker now using the new key."
