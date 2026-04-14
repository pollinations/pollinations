#!/bin/bash
# Rotate PERPLEXITY_API_KEY using the Perplexity token management API.
#
# Usage: ./rotate-genai-perplexity.sh [--dry-run]
#
# This script:
# 1. Reads the current key from SOPS
# 2. Creates a new key via POST /generate_auth_token (authed with old key)
# 3. Updates SOPS
# 4. Verifies the new key works
# 5. Revokes the old key via POST /revoke_auth_token (authed with new key)
#
# Prerequisites:
# - sops configured and working
# - jq installed
# - curl installed
#
# After running, commit the SOPS changes and redeploy EC2 text service.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"

DRY_RUN=false
VERIFY_ONLY=false

while [[ "$1" == --* ]]; do
    case "$1" in
        --dry-run) DRY_RUN=true; shift ;;
        --verify) VERIFY_ONLY=true; shift ;;
        *) echo "Unknown flag: $1"; exit 1 ;;
    esac
done

# Colors
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

FAILURES=()

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made"
fi

#######################################
# 1. Read current key from SOPS
#######################################
section "Reading current PERPLEXITY_API_KEY from SOPS"

if [ ! -f "$TEXT_SOPS" ]; then
    error "SOPS file not found: $TEXT_SOPS"
    exit 1
fi

OLD_KEY=$(sops -d "$TEXT_SOPS" | jq -r '.PERPLEXITY_API_KEY')
if [ -z "$OLD_KEY" ] || [ "$OLD_KEY" = "null" ]; then
    error "Could not read PERPLEXITY_API_KEY from SOPS"
    exit 1
fi
log "Current key: ${OLD_KEY:0:12}..."

if $VERIFY_ONLY; then
    section "Verifying Perplexity API key"
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
        -X POST "$API_BASE/chat/completions" \
        -H "Authorization: Bearer $OLD_KEY" \
        -H "Content-Type: application/json" \
        -d '{"model":"sonar","messages":[{"role":"user","content":"ping"}],"max_tokens":1}')
    if [ "$STATUS" = "200" ]; then
        log "Perplexity API key valid (HTTP 200)"
        exit 0
    else
        error "Perplexity API key invalid (HTTP $STATUS)"
        exit 1
    fi
fi

#######################################
# 2. Create new key
#######################################
section "Creating new API key"

if ! $DRY_RUN; then
    RESPONSE=$(curl -s --fail-with-body --request POST \
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
else
    NEW_KEY="pplx-dry-run-key"
    log "[dry-run] Would create new key via $API_BASE/generate_auth_token"
fi

#######################################
# 3. Update SOPS
#######################################
section "Updating SOPS"

fname="text.pollinations.ai/env.json"
if $DRY_RUN; then
    log "[dry-run] sops --set PERPLEXITY_API_KEY in $fname"
else
    if sops --set "[\"PERPLEXITY_API_KEY\"] \"$NEW_KEY\"" "$TEXT_SOPS"; then
        log "$fname"
    else
        error "$fname"
        FAILURES+=("SOPS: $fname")
    fi
fi

#######################################
# 4. Verify new key
#######################################
section "Verifying new key"

if ! $DRY_RUN; then
    VERIFY=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 \
        --request POST \
        --url "$API_BASE/chat/completions" \
        --header "Authorization: Bearer $NEW_KEY" \
        --header "Content-Type: application/json" \
        --data '{"model":"sonar","messages":[{"role":"user","content":"ping"}],"max_tokens":1}')

    if [ "$VERIFY" = "200" ]; then
        log "New key verified (HTTP 200)"
    else
        error "New key verification failed (HTTP $VERIFY)"
        error "Old key NOT revoked — fix manually"
        exit 1
    fi
else
    log "[dry-run] Would verify new key with chat/completions"
fi

#######################################
# 5. Revoke old key (auth with new key)
#######################################
section "Revoking old key"

if ! $DRY_RUN; then
    REVOKE=$(curl -s -o /dev/null -w "%{http_code}" \
        --request POST \
        --url "$API_BASE/revoke_auth_token" \
        --header "Authorization: Bearer $NEW_KEY" \
        --header "Content-Type: application/json" \
        --data "{\"auth_token\": \"$OLD_KEY\"}")

    if [ "$REVOKE" = "200" ]; then
        log "Old key revoked"
    else
        warn "Revocation returned HTTP $REVOKE — check manually"
        FAILURES+=("Revoke old key")
    fi
else
    log "[dry-run] Would revoke old key via $API_BASE/revoke_auth_token"
fi

#######################################
# Summary
#######################################
section "Perplexity Key Rotation Summary"

echo ""
if ! $DRY_RUN; then
    log "New key: ${NEW_KEY:0:12}..."
fi
echo "Updated: text.pollinations.ai/secrets/env.json"
echo ""

if [ ${#FAILURES[@]} -eq 0 ]; then
    log "All updates completed successfully!"
    echo ""
    log "Next steps:"
    echo "  1. Commit the SOPS file changes"
    echo "  2. Deploy text EC2 service"
else
    error "The following updates failed:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
fi
