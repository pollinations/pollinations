#!/bin/bash
# Rotate ELEVENLABS_API_KEY using the ElevenLabs service account API.
#
# Usage: ./rotate-genai-elevenlabs.sh [--execute]
#
# Default: dry-run (verify current key + preview, no mutation).
# Pass --execute to actually rotate.
#
# Environment variables (required):
#   ELEVENLABS_SERVICE_ACCOUNT_ID — Service account user ID
#     (from ElevenLabs workspace > Service Accounts)
#
# NOTE: Only works for service account keys (multi-seat plans: Scale/Business/Enterprise).
# Personal API keys can only be rotated via the ElevenLabs dashboard.
#
# This script:
# 1. Reads the current key from SOPS
# 2. Lists existing keys to find the old key ID
# 3. Creates a new service account key
# 4. Updates SOPS (3 environments) + Wrangler secrets
# 5. Deletes the old key
#
# Prerequisites:
# - sops, jq, curl installed
# - ELEVENLABS_SERVICE_ACCOUNT_ID set
# - wrangler CLI authenticated (for Wrangler secret updates)
#
# After running, commit the SOPS changes. Wrangler secrets are updated live.

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

run() {
    if $DRY_RUN; then
        log "[dry-run] $1"
        return 0
    fi
    set +e
    eval "$2"
    local status=$?
    set -e
    return $status
}

ENTER_DIR="$REPO_ROOT/enter.pollinations.ai"
API_BASE="https://api.elevenlabs.io/v1"
SOPS_FILES=(
    "$ENTER_DIR/secrets/dev.vars.json"
    "$ENTER_DIR/secrets/staging.vars.json"
    "$ENTER_DIR/secrets/prod.vars.json"
)

FAILURES=()

if [ -z "$ELEVENLABS_SERVICE_ACCOUNT_ID" ]; then
    error "ELEVENLABS_SERVICE_ACCOUNT_ID must be set"
    echo "Find it in ElevenLabs workspace > Service Accounts"
    echo ""
    echo "If using a personal API key (not service account), rotate manually:"
    echo "  1. Go to https://elevenlabs.io/app/settings/api-keys"
    echo "  2. Create new key, update SOPS + Wrangler, delete old key"
    exit 1
fi

SA_URL="$API_BASE/service-accounts/$ELEVENLABS_SERVICE_ACCOUNT_ID/api-keys"

#######################################
# 1. Read current key from SOPS
#######################################
section "Reading current ELEVENLABS_API_KEY from SOPS"

PROD_SOPS="${SOPS_FILES[2]}"
if [ ! -f "$PROD_SOPS" ]; then
    error "SOPS file not found: $PROD_SOPS"
    exit 1
fi

OLD_KEY=$(sops -d "$PROD_SOPS" | jq -r '.ELEVENLABS_API_KEY')
if [ -z "$OLD_KEY" ] || [ "$OLD_KEY" = "null" ]; then
    error "Could not read ELEVENLABS_API_KEY from SOPS"
    exit 1
fi
log "Current key: ${OLD_KEY:0:8}..."

section "Pre-flight: verifying ElevenLabs API key"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
    "https://api.elevenlabs.io/v1/user" \
    -H "xi-api-key: $OLD_KEY")
if [ "$STATUS" != "200" ]; then
    error "ElevenLabs API key invalid (HTTP $STATUS)"
    exit 1
fi
log "ElevenLabs API key valid (HTTP 200)"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
fi

#######################################
# 2. List keys to find old key ID
#######################################
section "Listing existing service account keys"

if ! $DRY_RUN; then
    LIST_RESPONSE=$(curl -s --fail-with-body \
        --url "$SA_URL" \
        --header "xi-api-key: $OLD_KEY") || {
        error "Failed to list keys: $LIST_RESPONSE"
        error "This may mean the key is a personal key, not a service account key."
        exit 1
    }

    # Find key_id — try matching or just get all IDs
    OLD_KEY_ID=$(echo "$LIST_RESPONSE" | jq -r '.[0].key_id // empty' 2>/dev/null)
    TOTAL_KEYS=$(echo "$LIST_RESPONSE" | jq 'length' 2>/dev/null || echo "?")
    log "Found $TOTAL_KEYS key(s)"
    if [ -n "$OLD_KEY_ID" ]; then
        log "Old key ID: $OLD_KEY_ID"
    fi
else
    OLD_KEY_ID="dry-run-key-id"
    log "[dry-run] Would list service account keys"
fi

#######################################
# 3. Create new key
#######################################
section "Creating new service account key"

if ! $DRY_RUN; then
    CREATE_RESPONSE=$(curl -s --fail-with-body \
        --request POST \
        --url "$SA_URL" \
        --header "xi-api-key: $OLD_KEY" \
        --header "Content-Type: application/json" \
        --data '{"name":"rotated-'"$(date +%Y%m%d-%H%M%S)"'","permissions":"all"}') || {
        error "Failed to create new key: $CREATE_RESPONSE"
        exit 1
    }

    NEW_KEY=$(echo "$CREATE_RESPONSE" | jq -r '.["xi-api-key"] // .api_key // empty')
    NEW_KEY_ID=$(echo "$CREATE_RESPONSE" | jq -r '.key_id // empty')

    if [ -z "$NEW_KEY" ]; then
        error "No key in response: $CREATE_RESPONSE"
        exit 1
    fi
    log "New key: ${NEW_KEY:0:8}..."
    log "New key ID: $NEW_KEY_ID"
else
    NEW_KEY="sk_dry_run_key"
    NEW_KEY_ID="dry-run-new-id"
    log "[dry-run] Would create new service account key"
fi

#######################################
# 4. Update SOPS (3 environments)
#######################################
section "Updating SOPS-encrypted secrets"

for f in "${SOPS_FILES[@]}"; do
    fname=$(basename "$f")
    if $DRY_RUN; then
        log "[dry-run] sops --set ELEVENLABS_API_KEY in $fname"
    else
        if sops --set "[\"ELEVENLABS_API_KEY\"] \"$NEW_KEY\"" "$f"; then
            log "$fname"
        else
            error "$fname"
            FAILURES+=("SOPS: $fname")
        fi
    fi
done

#######################################
# 5. Update Wrangler secrets
#######################################
section "Updating Wrangler secrets (enter.pollinations.ai)"

run "wrangler secret put ELEVENLABS_API_KEY --env production" \
    "echo '$NEW_KEY' | npx wrangler secret put ELEVENLABS_API_KEY --env production --config '$ENTER_DIR/wrangler.toml'"
if [ $? -eq 0 ]; then log "production"; else error "production"; FAILURES+=("Wrangler: production"); fi

run "wrangler secret put ELEVENLABS_API_KEY --env staging" \
    "echo '$NEW_KEY' | npx wrangler secret put ELEVENLABS_API_KEY --env staging --config '$ENTER_DIR/wrangler.toml'"
if [ $? -eq 0 ]; then log "staging"; else error "staging"; FAILURES+=("Wrangler: staging"); fi

#######################################
# 6. Delete old key
#######################################
section "Deleting old key"

if ! $DRY_RUN && [ -n "$OLD_KEY_ID" ]; then
    DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        --request DELETE \
        --url "$SA_URL/$OLD_KEY_ID" \
        --header "xi-api-key: $NEW_KEY")

    if [ "$DELETE_STATUS" = "200" ]; then
        log "Old key deleted (ID: $OLD_KEY_ID)"
    else
        warn "Delete returned HTTP $DELETE_STATUS — check manually"
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
section "ElevenLabs Key Rotation Summary"

echo ""
if ! $DRY_RUN; then
    log "New key: ${NEW_KEY:0:8}..."
fi
echo "Updated:"
echo "  - enter.pollinations.ai/secrets/{dev,staging,prod}.vars.json"
echo "  - Wrangler secrets (production + staging)"
echo ""

if [ ${#FAILURES[@]} -eq 0 ]; then
    log "All updates completed successfully!"
    echo ""
    log "Next steps:"
    echo "  1. Commit the SOPS file changes"
    echo "  2. Verify TTS/STT endpoints"
else
    error "The following updates failed:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
fi
