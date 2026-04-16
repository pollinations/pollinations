#!/bin/bash
# Rotate ELEVENLABS_API_KEY using the ElevenLabs service account API.
#
# Usage: ./rotate-genai-elevenlabs.sh [--execute]
#
# Default: dry-run (verify admin creds + preview, no mutation).
# Pass --execute to actually rotate.
#
# Two distinct credentials:
#   ELEVENLABS_ADMIN_API_KEY       — admin key (from the "rotate" service
#                                    account or a workspace-admin key). Used
#                                    to authenticate all management calls.
#                                    Static — never rotated by this script.
#   ELEVENLABS_SERVICE_ACCOUNT_ID  — user_id of the service account whose
#                                    keys we rotate.
#   ELEVENLABS_API_KEY (in enter SOPS) — the runtime generative key that
#                                    enter.pollinations.ai uses for TTS/STT.
#                                    This is what this script rotates.
#
# The admin key + SA ID live in tools/scripts/rotation/secrets.vars.json.
# On first run, the runtime key may be a personal key (not under the SA); in
# that case we create a fresh SA key, store it as ELEVENLABS_API_KEY, and
# warn that the old personal key must be revoked manually.
#
# Prerequisites:
# - sops, jq, curl installed
# - wrangler CLI authenticated (for Wrangler secret updates)

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
    error "ELEVENLABS_SERVICE_ACCOUNT_ID must be set (in rotation SOPS or env)"
    exit 1
fi

if [ -z "$ELEVENLABS_ADMIN_API_KEY" ]; then
    error "ELEVENLABS_ADMIN_API_KEY must be set (in rotation SOPS or env)"
    echo "This is the workspace-admin key used to manage SA keys — distinct from"
    echo "the runtime ELEVENLABS_API_KEY that this script rotates."
    exit 1
fi

SA_URL="$API_BASE/service-accounts/$ELEVENLABS_SERVICE_ACCOUNT_ID/api-keys"

#######################################
# Pre-flight: admin key can manage SA keys + read runtime key from SOPS
#######################################
section "Pre-flight: verifying ElevenLabs admin key"
LIST_RESPONSE=$(curl -sS --fail-with-body --max-time 15 \
    -H "xi-api-key: $ELEVENLABS_ADMIN_API_KEY" \
    "$SA_URL") || {
    error "Admin key cannot list SA keys: $LIST_RESPONSE"
    error "Ensure ELEVENLABS_ADMIN_API_KEY has workspace_read + workspace_write permissions."
    exit 1
}
CURRENT_SA_KEY_COUNT=$(echo "$LIST_RESPONSE" | jq '."api-keys" | length')
log "Admin key OK — $CURRENT_SA_KEY_COUNT key(s) currently under SA"

section "Pre-flight: reading runtime ELEVENLABS_API_KEY from SOPS"
PROD_SOPS="${SOPS_FILES[2]}"
if [ ! -f "$PROD_SOPS" ]; then
    error "SOPS file not found: $PROD_SOPS"
    exit 1
fi
OLD_KEY=$(sops -d "$PROD_SOPS" | jq -r '.ELEVENLABS_API_KEY')
if [ -z "$OLD_KEY" ] || [ "$OLD_KEY" = "null" ]; then
    error "Could not read ELEVENLABS_API_KEY from $PROD_SOPS"
    exit 1
fi
log "Current runtime key: ${OLD_KEY:0:8}..."

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
fi

#######################################
# Find old key ID under the SA (best-effort; may not exist on first run)
#######################################
section "Locating current runtime key under SA (for later cleanup)"

OLD_KEY_HINT="${OLD_KEY: -4}"
OLD_KEY_ID=$(echo "$LIST_RESPONSE" | jq -r --arg h "$OLD_KEY_HINT" \
    '."api-keys"[] | select(.hint == $h) | .key_id' | head -1)

if [ -n "$OLD_KEY_ID" ]; then
    log "Runtime key found under SA: $OLD_KEY_ID (will be deleted after rotation)"
else
    warn "Runtime key not found under SA (hint: $OLD_KEY_HINT)"
    warn "Old key is likely a personal key — can't delete via SA API."
    warn "After rotation, revoke it manually in ElevenLabs > Settings > API Keys."
fi

#######################################
# Create new SA key
#######################################
section "Creating new service account key"

if ! $DRY_RUN; then
    CREATE_RESPONSE=$(curl -sS --fail-with-body \
        -X POST "$SA_URL" \
        -H "xi-api-key: $ELEVENLABS_ADMIN_API_KEY" \
        -H "Content-Type: application/json" \
        --data '{"name":"rotated-'"$(date +%Y%m%d-%H%M%S)"'","permissions":"all"}') || {
        error "Failed to create new key: $CREATE_RESPONSE"
        exit 1
    }

    NEW_KEY=$(echo "$CREATE_RESPONSE" | jq -r '.["xi-api-key"] // empty')
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
    log "[dry-run] Would create new SA key authed with admin key"
fi

#######################################
# Update SOPS (3 environments)
#######################################
section "Updating runtime SOPS"

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
# Update Wrangler secrets
#######################################
section "Updating Wrangler secrets (enter.pollinations.ai)"

run "wrangler secret put ELEVENLABS_API_KEY --env production" \
    "echo '$NEW_KEY' | npx wrangler secret put ELEVENLABS_API_KEY --env production --config '$ENTER_DIR/wrangler.toml'"
if [ $? -eq 0 ]; then log "production"; else error "production"; FAILURES+=("Wrangler: production"); fi

run "wrangler secret put ELEVENLABS_API_KEY --env staging" \
    "echo '$NEW_KEY' | npx wrangler secret put ELEVENLABS_API_KEY --env staging --config '$ENTER_DIR/wrangler.toml'"
if [ $? -eq 0 ]; then log "staging"; else error "staging"; FAILURES+=("Wrangler: staging"); fi

#######################################
# Delete old key (only if under SA)
#######################################
section "Deleting old SA key"

if $DRY_RUN; then
    if [ -n "$OLD_KEY_ID" ]; then
        log "[dry-run] Would delete $OLD_KEY_ID via admin key"
    else
        log "[dry-run] Skip delete — old key not under SA"
    fi
elif [ -n "$OLD_KEY_ID" ]; then
    DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -X DELETE "$SA_URL/$OLD_KEY_ID" \
        -H "xi-api-key: $ELEVENLABS_ADMIN_API_KEY")
    if [ "$DELETE_STATUS" = "200" ]; then
        log "Old key deleted (ID: $OLD_KEY_ID)"
    else
        warn "Delete returned HTTP $DELETE_STATUS — check manually"
        FAILURES+=("Delete old key: $OLD_KEY_ID")
    fi
else
    warn "Skipping delete — old runtime key not under SA (revoke manually)"
fi

#######################################
# Summary
#######################################
section "ElevenLabs Key Rotation Summary"

echo ""
if ! $DRY_RUN; then
    log "New runtime key: ${NEW_KEY:0:8}..."
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
    if [ -z "$OLD_KEY_ID" ] && ! $DRY_RUN; then
        echo "  3. Revoke the previous personal key manually in ElevenLabs UI"
    fi
else
    error "The following updates failed:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
fi
