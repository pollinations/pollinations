#!/bin/bash
# Rotate XAI_API_KEY using the xAI Management API.
#
# Usage: ./rotate-genai-xai.sh [--execute]
#
# Default: dry-run (verify Management API access + preview, no mutation).
# Pass --execute to actually rotate.
#
# Environment variables (required):
#   XAI_MANAGEMENT_KEY — Management API key (from console.x.ai > Settings > Management Keys)
#   XAI_TEAM_ID        — Team ID (from console.x.ai > Team settings)
#
# This script:
# 1. Reads the current key prefix from SOPS
# 2. Lists keys to find the matching apiKeyId
# 3. Uses the /rotate endpoint to get a new secret (keeps same key ID, name, ACLs)
# 4. Updates SOPS with the new key
#
# Prerequisites:
# - sops, jq, curl installed
# - XAI_MANAGEMENT_KEY and XAI_TEAM_ID set
#
# After running, commit the SOPS changes and redeploy EC2 image service.

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

source "$SCRIPT_DIR/_load-admin-secrets.sh"

IMAGE_SOPS="$REPO_ROOT/image.pollinations.ai/secrets/env.json"
MGMT_API="https://management-api.x.ai"

FAILURES=()

if [ -z "$XAI_MANAGEMENT_KEY" ]; then
    error "XAI_MANAGEMENT_KEY must be set (get from console.x.ai > Settings > Management Keys)"
    exit 1
fi
if [ -z "$XAI_TEAM_ID" ]; then
    error "XAI_TEAM_ID must be set (get from console.x.ai > Team settings)"
    exit 1
fi

#######################################
# 1. Read current key from SOPS
#######################################
section "Reading current XAI_API_KEY from SOPS"

if [ ! -f "$IMAGE_SOPS" ]; then
    error "SOPS file not found: $IMAGE_SOPS"
    exit 1
fi

OLD_KEY=$(sops -d "$IMAGE_SOPS" | jq -r '.XAI_API_KEY')
if [ -z "$OLD_KEY" ] || [ "$OLD_KEY" = "null" ]; then
    error "Could not read XAI_API_KEY from SOPS"
    exit 1
fi
OLD_PREFIX="${OLD_KEY:0:12}"
log "Current key prefix: $OLD_PREFIX..."

section "Pre-flight: verifying xAI Management API access"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
    "$MGMT_API/auth/teams/$XAI_TEAM_ID/api-keys?pageSize=1" \
    -H "Authorization: Bearer $XAI_MANAGEMENT_KEY")
if [ "$STATUS" != "200" ]; then
    error "xAI Management API access failed (HTTP $STATUS)"
    exit 1
fi
log "xAI Management API access OK (HTTP 200)"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
fi

#######################################
# 2. Find key ID by listing keys
#######################################
section "Listing keys to find apiKeyId"

if ! $DRY_RUN; then
    LIST_RESPONSE=$(curl -s --fail-with-body \
        --url "$MGMT_API/auth/teams/$XAI_TEAM_ID/api-keys?pageSize=100" \
        --header "Authorization: Bearer $XAI_MANAGEMENT_KEY") || {
        error "Failed to list keys: $LIST_RESPONSE"
        exit 1
    }

    # Match by redactedApiKey prefix
    API_KEY_ID=$(echo "$LIST_RESPONSE" | jq -r \
        --arg prefix "${OLD_KEY:0:8}" \
        '.[] | select(.redactedApiKey | startswith($prefix)) | .apiKeyId' 2>/dev/null | head -1)

    if [ -z "$API_KEY_ID" ]; then
        # Try matching with shorter prefix
        API_KEY_ID=$(echo "$LIST_RESPONSE" | jq -r \
            --arg prefix "${OLD_KEY:0:4}" \
            '.[] | select(.redactedApiKey | startswith($prefix)) | .apiKeyId' 2>/dev/null | head -1)
    fi

    if [ -z "$API_KEY_ID" ]; then
        error "Could not find apiKeyId matching prefix $OLD_PREFIX"
        error "Listed keys:"
        echo "$LIST_RESPONSE" | jq '.[].redactedApiKey' 2>/dev/null || echo "$LIST_RESPONSE"
        exit 1
    fi
    log "Found apiKeyId: $API_KEY_ID"
else
    API_KEY_ID="dry-run-key-id"
    log "[dry-run] Would list keys to find apiKeyId"
fi

#######################################
# 3. Rotate (new secret, same key ID)
#######################################
section "Rotating key via Management API"

if ! $DRY_RUN; then
    ROTATE_RESPONSE=$(curl -s --fail-with-body \
        --request POST \
        --url "$MGMT_API/auth/api-keys/$API_KEY_ID/rotate" \
        --header "Authorization: Bearer $XAI_MANAGEMENT_KEY") || {
        error "Failed to rotate key: $ROTATE_RESPONSE"
        exit 1
    }

    NEW_KEY=$(echo "$ROTATE_RESPONSE" | jq -r '.apiKey')
    if [ -z "$NEW_KEY" ] || [ "$NEW_KEY" = "null" ]; then
        error "No apiKey in rotate response: $ROTATE_RESPONSE"
        exit 1
    fi
    log "New key: ${NEW_KEY:0:12}..."
    warn "Old key is immediately invalidated by rotate"
else
    NEW_KEY="xai-dry-run-key"
    log "[dry-run] Would rotate key $API_KEY_ID via $MGMT_API/auth/api-keys/$API_KEY_ID/rotate"
fi

#######################################
# 4. Update SOPS
#######################################
section "Updating SOPS"

fname="image.pollinations.ai/env.json"
if $DRY_RUN; then
    log "[dry-run] sops --set XAI_API_KEY in $fname"
else
    if sops --set "[\"XAI_API_KEY\"] \"$NEW_KEY\"" "$IMAGE_SOPS"; then
        log "$fname"
    else
        error "$fname"
        FAILURES+=("SOPS: $fname")
    fi
fi

#######################################
# Summary
#######################################
section "xAI Key Rotation Summary"

echo ""
if ! $DRY_RUN; then
    log "New key: ${NEW_KEY:0:12}..."
fi
echo "Updated: image.pollinations.ai/secrets/env.json"
echo ""
warn "The old key was invalidated immediately by the rotate endpoint."
warn "Deploy image EC2 service NOW to pick up the new key."
echo ""

if [ ${#FAILURES[@]} -eq 0 ]; then
    log "All updates completed successfully!"
    echo ""
    log "Next steps:"
    echo "  1. Commit the SOPS file changes"
    echo "  2. Deploy image EC2 service IMMEDIATELY"
else
    error "The following updates failed:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
fi
