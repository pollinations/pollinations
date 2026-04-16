#!/bin/bash
# Rotate FIREWORKS_API_KEY using the Fireworks AI key management API.
#
# Usage: ./rotate-genai-fireworks.sh [--execute]
#
# Default: dry-run (verify current key + preview, no mutation).
# Pass --execute to actually rotate.
#
# Environment variables (required):
#   FIREWORKS_ACCOUNT_ID — your Fireworks account ID
#   FIREWORKS_USER_ID    — your Fireworks user ID
#   (find both in the Fireworks dashboard or ~/.fireworks/auth.ini)
#
# This script:
# 1. Reads the current key from SOPS
# 2. Lists existing keys to find the old key's ID
# 3. Creates a new key via the Fireworks API
# 4. Updates SOPS
# 5. Deletes the old key (authed with new key)
#
# Prerequisites:
# - sops, jq, curl installed
# - FIREWORKS_ACCOUNT_ID and FIREWORKS_USER_ID set
#
# After running, commit the SOPS changes and redeploy EC2 text service.

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

TEXT_SOPS="$REPO_ROOT/text.pollinations.ai/secrets/env.json"
API_BASE="https://api.fireworks.ai/v1"

FAILURES=()

# Try to read account/user from ~/.fireworks/auth.ini if not set
if [ -z "$FIREWORKS_ACCOUNT_ID" ] && [ -f "$HOME/.fireworks/auth.ini" ]; then
    FIREWORKS_ACCOUNT_ID=$(grep -oP 'account_id\s*=\s*\K.*' "$HOME/.fireworks/auth.ini" 2>/dev/null || true)
fi
if [ -z "$FIREWORKS_USER_ID" ] && [ -f "$HOME/.fireworks/auth.ini" ]; then
    FIREWORKS_USER_ID=$(grep -oP 'user_id\s*=\s*\K.*' "$HOME/.fireworks/auth.ini" 2>/dev/null || true)
fi

if [ -z "$FIREWORKS_ACCOUNT_ID" ] || [ -z "$FIREWORKS_USER_ID" ]; then
    error "FIREWORKS_ACCOUNT_ID and FIREWORKS_USER_ID must be set"
    echo "Find them in the Fireworks dashboard or ~/.fireworks/auth.ini"
    exit 1
fi

log "Account: $FIREWORKS_ACCOUNT_ID"
log "User: $FIREWORKS_USER_ID"

KEYS_URL="$API_BASE/accounts/$FIREWORKS_ACCOUNT_ID/users/$FIREWORKS_USER_ID/apiKeys"

#######################################
# 1. Read current key from SOPS
#######################################
section "Reading current FIREWORKS_API_KEY from SOPS"

if [ ! -f "$TEXT_SOPS" ]; then
    error "SOPS file not found: $TEXT_SOPS"
    exit 1
fi

OLD_KEY=$(sops -d "$TEXT_SOPS" | jq -r '.FIREWORKS_API_KEY')
if [ -z "$OLD_KEY" ] || [ "$OLD_KEY" = "null" ]; then
    error "Could not read FIREWORKS_API_KEY from SOPS"
    exit 1
fi
OLD_PREFIX="${OLD_KEY:0:8}"
log "Current key prefix: $OLD_PREFIX..."

section "Pre-flight: verifying Fireworks API key"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
    "$KEYS_URL" \
    -H "Authorization: Bearer $OLD_KEY")
if [ "$STATUS" != "200" ]; then
    error "Fireworks API key invalid (HTTP $STATUS)"
    exit 1
fi
log "Fireworks API key valid (HTTP 200)"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
fi

#######################################
# 2. Find old key ID
#######################################
section "Listing existing keys"

if ! $DRY_RUN; then
    LIST_RESPONSE=$(curl -s --fail-with-body \
        --url "$KEYS_URL" \
        --header "Authorization: Bearer $OLD_KEY") || {
        error "Failed to list keys: $LIST_RESPONSE"
        exit 1
    }

    # Find the keyId matching our current key's prefix
    OLD_KEY_ID=$(echo "$LIST_RESPONSE" | jq -r \
        --arg prefix "$OLD_PREFIX" \
        '.apiKeys[] | select(.prefix | startswith($prefix)) | .keyId' | head -1)

    if [ -z "$OLD_KEY_ID" ]; then
        warn "Could not find keyId for prefix $OLD_PREFIX — old key won't be auto-deleted"
    else
        log "Old key ID: $OLD_KEY_ID"
    fi
else
    OLD_KEY_ID="dry-run-key-id"
    log "[dry-run] Would list keys to find old key ID"
fi

#######################################
# 3. Create new key
#######################################
section "Creating new API key"

if ! $DRY_RUN; then
    CREATE_RESPONSE=$(curl -s --fail-with-body \
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
else
    NEW_KEY="fw_dry_run_key"
    log "[dry-run] Would create new key"
fi

#######################################
# 4. Update SOPS
#######################################
section "Updating SOPS"

fname="text.pollinations.ai/env.json"
if $DRY_RUN; then
    log "[dry-run] sops --set FIREWORKS_API_KEY in $fname"
else
    if sops --set "[\"FIREWORKS_API_KEY\"] \"$NEW_KEY\"" "$TEXT_SOPS"; then
        log "$fname"
    else
        error "$fname"
        FAILURES+=("SOPS: $fname")
    fi
fi

#######################################
# 5. Delete old key (auth with new key)
#######################################
section "Deleting old key"

if ! $DRY_RUN && [ -n "$OLD_KEY_ID" ]; then
    DELETE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
        --request POST \
        --url "$KEYS_URL:delete" \
        --header "Authorization: Bearer $NEW_KEY" \
        --header "Content-Type: application/json" \
        --data "{\"keyId\": \"$OLD_KEY_ID\"}")

    if [ "$DELETE_RESPONSE" = "200" ]; then
        log "Old key deleted (ID: $OLD_KEY_ID)"
    else
        warn "Delete returned HTTP $DELETE_RESPONSE — check manually"
        FAILURES+=("Delete old key: $OLD_KEY_ID")
    fi
elif $DRY_RUN; then
    log "[dry-run] Would delete old key"
else
    warn "Skipping delete — old key ID not found"
fi

#######################################
# Summary
#######################################
section "Fireworks Key Rotation Summary"

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
