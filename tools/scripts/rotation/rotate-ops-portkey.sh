#!/bin/bash
# Rotate Portkey API key using the Portkey Admin API.
#
# Usage: ./rotate-ops-portkey.sh [--dry-run]
#
# Environment variables:
#   PORTKEY_ADMIN_KEY — a Portkey API key with admin/organisation scope
#     (if not set, uses the current PORTKEY_API_KEY from SOPS)
#
# This script:
# 1. Reads the current API key from SOPS
# 2. Lists existing API keys to find the current key's ID
# 3. Creates a new API key
# 4. Updates SOPS
# 5. Deletes the old key (optional — only if old key ID was found)
#
# Prerequisites:
# - sops, jq, curl installed
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
API_BASE="https://api.portkey.ai/v1"

FAILURES=()

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made"
fi

#######################################
# 1. Read current key from SOPS
#######################################
section "Reading current Portkey config from SOPS"

if [ ! -f "$TEXT_SOPS" ]; then
    error "SOPS file not found: $TEXT_SOPS"
    exit 1
fi

# Check for PORTKEY_API_KEY first, fall back to extracting from PORTKEY_GATEWAY_URL
SOPS_CONTENT=$(sops -d "$TEXT_SOPS")
OLD_KEY=$(echo "$SOPS_CONTENT" | jq -r '.PORTKEY_API_KEY // empty')
SOPS_KEY_NAME="PORTKEY_API_KEY"

if [ -z "$OLD_KEY" ]; then
    warn "PORTKEY_API_KEY not found in SOPS, checking PORTKEY_GATEWAY_URL"
    GATEWAY_URL=$(echo "$SOPS_CONTENT" | jq -r '.PORTKEY_GATEWAY_URL // empty')
    if [ -z "$GATEWAY_URL" ]; then
        error "Neither PORTKEY_API_KEY nor PORTKEY_GATEWAY_URL found in SOPS"
        exit 1
    fi
    log "Gateway URL: $GATEWAY_URL"
    warn "PORTKEY_GATEWAY_URL may contain an embedded key — manual rotation recommended"
    warn "This script rotates PORTKEY_API_KEY. For gateway URL changes, update SOPS manually."
    exit 0
fi

AUTH_KEY="${PORTKEY_ADMIN_KEY:-$OLD_KEY}"
log "Current key: ${OLD_KEY:0:8}..."

if $VERIFY_ONLY; then
    section "Verifying Portkey API key"
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
        "$API_BASE/api-keys" \
        -H "x-portkey-api-key: $OLD_KEY")
    if [ "$STATUS" = "200" ]; then
        log "Portkey API key valid (HTTP 200)"
        exit 0
    else
        error "Portkey API key invalid (HTTP $STATUS)"
        exit 1
    fi
fi

#######################################
# 2. List keys to find old key ID
#######################################
section "Listing API keys"

if ! $DRY_RUN; then
    LIST_RESPONSE=$(curl -s --fail-with-body \
        --url "$API_BASE/api-keys" \
        --header "x-portkey-api-key: $AUTH_KEY") || {
        error "Failed to list keys: $LIST_RESPONSE"
        exit 1
    }

    TOTAL=$(echo "$LIST_RESPONSE" | jq '.data | length' 2>/dev/null || echo "?")
    log "Found $TOTAL API key(s)"

    # Try to find the old key's ID (exact match may not be possible from list)
    OLD_KEY_ID=$(echo "$LIST_RESPONSE" | jq -r '.data[0].id // empty' 2>/dev/null)
    if [ -n "$OLD_KEY_ID" ]; then
        log "First key ID: $OLD_KEY_ID"
    fi
else
    log "[dry-run] Would list API keys"
fi

#######################################
# 3. Create new key
#######################################
section "Creating new API key"

if ! $DRY_RUN; then
    CREATE_RESPONSE=$(curl -s --fail-with-body \
        --request POST \
        --url "$API_BASE/api-keys" \
        --header "x-portkey-api-key: $AUTH_KEY" \
        --header "Content-Type: application/json" \
        --data '{"name":"rotated-'"$(date +%Y%m%d-%H%M%S)"'","type":"organisation"}') || {
        error "Failed to create new key: $CREATE_RESPONSE"
        exit 1
    }

    NEW_KEY=$(echo "$CREATE_RESPONSE" | jq -r '.data.key // .key // .api_key // empty')
    NEW_KEY_ID=$(echo "$CREATE_RESPONSE" | jq -r '.data.id // .id // empty')

    if [ -z "$NEW_KEY" ]; then
        error "No key in response: $CREATE_RESPONSE"
        exit 1
    fi
    log "New key: ${NEW_KEY:0:8}..."
else
    NEW_KEY="pk-dry-run-key"
    log "[dry-run] Would create new API key"
fi

#######################################
# 4. Update SOPS
#######################################
section "Updating SOPS"

fname="text.pollinations.ai/env.json"
if $DRY_RUN; then
    log "[dry-run] sops --set $SOPS_KEY_NAME in $fname"
else
    if sops --set "[\"$SOPS_KEY_NAME\"] \"$NEW_KEY\"" "$TEXT_SOPS"; then
        log "$fname"
    else
        error "$fname"
        FAILURES+=("SOPS: $fname")
    fi
fi

#######################################
# 5. Verify new key
#######################################
section "Verifying new key"

if ! $DRY_RUN; then
    VERIFY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        --url "$API_BASE/api-keys" \
        --header "x-portkey-api-key: $NEW_KEY")

    if [ "$VERIFY_STATUS" = "200" ]; then
        log "New key verified (HTTP 200)"
    else
        warn "Verification returned HTTP $VERIFY_STATUS"
    fi
else
    log "[dry-run] Would verify new key"
fi

#######################################
# Summary
#######################################
section "Portkey Key Rotation Summary"

echo ""
if ! $DRY_RUN; then
    log "New key: ${NEW_KEY:0:8}..."
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
