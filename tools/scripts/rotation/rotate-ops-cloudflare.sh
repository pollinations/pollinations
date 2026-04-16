#!/bin/bash
# Rotate CLOUDFLARE_OBSERVABILITY_TOKEN using the Cloudflare REST API.
#
# Usage: ./rotate-ops-cloudflare.sh [--execute]
#
# Default: dry-run (verify token + preview, no mutation).
# Pass --execute to actually rotate.
#
# Rotates the single token used by the enter.pollinations.ai observability
# pipeline (Logpush / Workers Analytics Engine). The former
# CLOUDFLARE_API_TOKEN (image service, Workers AI) was removed when the
# Cloudflare image code path was retired — see commits 62011caa6 / cf0fbf63d.
#
# The roll endpoint generates a new secret while keeping the same token ID,
# name, and permissions. The old secret is immediately invalidated.
#
# Environment variables:
#   CF_MANAGEMENT_TOKEN — a Cloudflare token with "API Tokens: Edit" permission
#     (if not set, the script tries to use the token being rotated to roll
#     itself, which works if it has the "API Tokens: Edit" permission)
#
# Prerequisites:
# - sops, jq, curl installed
#
# After running, commit SOPS changes and redeploy affected services.

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

CF_API="https://api.cloudflare.com/client/v4"
ENTER_SOPS="$REPO_ROOT/enter.pollinations.ai/secrets/env.json"
SOPS_KEY="CLOUDFLARE_OBSERVABILITY_TOKEN"

FAILURES=()

verify_token_status() {
    local token=$1
    local response
    local success
    local status
    local message

    response=$(curl -s --max-time 15 \
        "$CF_API/user/tokens/verify" \
        -H "Authorization: Bearer $token")
    success=$(echo "$response" | jq -r '.success // false')
    status=$(echo "$response" | jq -r '.result.status // empty')
    message=$(echo "$response" | jq -r '.errors[0].message // .messages[0].message // "unknown response"')

    if [ "$success" = "true" ] && [ "$status" = "active" ]; then
        log "$SOPS_KEY valid (status: active)"
        return 0
    fi

    error "$SOPS_KEY invalid (status: ${status:-unknown}; message: $message)"
    return 1
}

#######################################
# Pre-flight: read token from SOPS + verify
#######################################
section "Pre-flight: reading $SOPS_KEY from SOPS"

if [ ! -f "$ENTER_SOPS" ]; then
    error "SOPS file not found: $ENTER_SOPS"
    exit 1
fi

CURRENT_TOKEN=$(sops -d "$ENTER_SOPS" | jq -r ".$SOPS_KEY // empty")
if [ -z "$CURRENT_TOKEN" ]; then
    error "$SOPS_KEY not found in SOPS ($ENTER_SOPS)"
    exit 1
fi
log "Current token: ${CURRENT_TOKEN:0:8}..."

section "Pre-flight: verifying $SOPS_KEY"
verify_token_status "$CURRENT_TOKEN" || exit 1

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
fi

#######################################
# Roll the observability token
#######################################
section "Rolling $SOPS_KEY"

AUTH_TOKEN="${CF_MANAGEMENT_TOKEN:-$CURRENT_TOKEN}"

if $DRY_RUN; then
    log "[dry-run] Would verify and roll $SOPS_KEY"
    log "[dry-run] sops --set $SOPS_KEY in enter.pollinations.ai/env.json"
    NEW_TOKEN="cf-dry-run-token"
else
    VERIFY_RESPONSE=$(curl -s --fail-with-body \
        "$CF_API/user/tokens/verify" \
        -H "Authorization: Bearer $CURRENT_TOKEN") || {
        error "Token verification failed: $VERIFY_RESPONSE"
        exit 1
    }

    TOKEN_ID=$(echo "$VERIFY_RESPONSE" | jq -r '.result.id')
    log "Token ID: $TOKEN_ID"

    ROLL_RESPONSE=$(curl -s --fail-with-body \
        -X PUT \
        "$CF_API/user/tokens/$TOKEN_ID/value" \
        -H "Authorization: Bearer $AUTH_TOKEN") || {
        error "Failed to roll token: $ROLL_RESPONSE"
        exit 1
    }

    NEW_TOKEN=$(echo "$ROLL_RESPONSE" | jq -r '.result // empty')
    if [ -z "$NEW_TOKEN" ]; then
        error "No token value in roll response"
        echo "$ROLL_RESPONSE" | jq . 2>/dev/null || echo "$ROLL_RESPONSE"
        exit 1
    fi
    log "New token: ${NEW_TOKEN:0:8}..."
    warn "Old token is immediately invalidated"

    if sops --set "[\"$SOPS_KEY\"] \"$NEW_TOKEN\"" "$ENTER_SOPS"; then
        log "SOPS: enter.pollinations.ai/env.json"
    else
        error "SOPS update failed"
        FAILURES+=("SOPS update")
    fi
fi

#######################################
# Summary
#######################################
section "Cloudflare Token Rotation Summary"
echo ""
warn "Rolled tokens are immediately invalidated."
warn "Redeploy the enter.pollinations.ai observability pipeline to pick up the new token."
echo ""

if [ ${#FAILURES[@]} -eq 0 ]; then
    log "All updates completed successfully!"
else
    error "The following updates failed:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
fi
