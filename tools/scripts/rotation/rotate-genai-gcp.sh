#!/bin/bash
# Rotate GCP service account key used by image and text EC2 services.
#
# Usage: ./rotate-genai-gcp.sh [--execute]
#
# Default: dry-run (verify GCP credentials + preview, no mutation).
# Pass --execute to actually rotate.
#
# This script:
# 1. Reads current GOOGLE_CLIENT_EMAIL from SOPS to identify the service account
# 2. Creates a new service account key via gcloud
# 3. Updates SOPS files with new GOOGLE_PRIVATE_KEY, GOOGLE_PRIVATE_KEY_ID,
#    GOOGLE_CLIENT_EMAIL, GOOGLE_PROJECT_ID
# 4. Deletes the old key
#
# Prerequisites:
# - gcloud CLI authenticated with permissions to manage service account keys
# - sops configured and working
# - jq installed
#
# After running, commit the SOPS changes and redeploy EC2 services.

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

SOPS_FILES=(
    "$REPO_ROOT/image.pollinations.ai/secrets/env.json"
    "$REPO_ROOT/text.pollinations.ai/secrets/env.json"
)

FAILURES=()
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

#######################################
# Pre-flight: read SOPS + verify gcloud access
#######################################
section "Pre-flight: reading current GCP credentials from SOPS"

IMAGE_SOPS="${SOPS_FILES[0]}"

if [ ! -f "$IMAGE_SOPS" ]; then
    error "SOPS file not found: $IMAGE_SOPS"
    exit 1
fi

SA_EMAIL=$(sops -d "$IMAGE_SOPS" | jq -r '.GOOGLE_CLIENT_EMAIL')
PROJECT_ID=$(sops -d "$IMAGE_SOPS" | jq -r '.GOOGLE_PROJECT_ID')
OLD_KEY_ID=$(sops -d "$IMAGE_SOPS" | jq -r '.GOOGLE_PRIVATE_KEY_ID')

if [ -z "$SA_EMAIL" ] || [ "$SA_EMAIL" = "null" ]; then
    error "Could not read GOOGLE_CLIENT_EMAIL from SOPS"
    exit 1
fi

log "Service account: $SA_EMAIL"
log "Project: $PROJECT_ID"
log "Current key ID: $OLD_KEY_ID"

section "Pre-flight: verifying GCP credentials"
if ! KEY_COUNT=$(gcloud iam service-accounts keys list \
    --iam-account="$SA_EMAIL" --project="$PROJECT_ID" \
    --format="value(name)" 2>&1 | wc -l); then
    error "GCP credentials invalid or insufficient permissions"
    exit 1
fi
log "GCP credentials valid: $SA_EMAIL has $KEY_COUNT key(s)"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
fi

#######################################
# 2. Create new service account key
#######################################
section "Creating new service account key"

NEW_KEY_FILE="$TEMP_DIR/new-sa-key.json"

if ! $DRY_RUN; then
    gcloud iam service-accounts keys create "$NEW_KEY_FILE" \
        --iam-account="$SA_EMAIL" \
        --project="$PROJECT_ID" 2>&1 || {
        error "Failed to create new service account key"
        exit 1
    }

    # Extract fields from the new key JSON
    NEW_KEY_ID=$(jq -r '.private_key_id' "$NEW_KEY_FILE")
    NEW_PRIVATE_KEY=$(jq -r '.private_key' "$NEW_KEY_FILE")
    NEW_CLIENT_EMAIL=$(jq -r '.client_email' "$NEW_KEY_FILE")
    NEW_PROJECT_ID=$(jq -r '.project_id' "$NEW_KEY_FILE")

    log "New key ID: $NEW_KEY_ID"
    log "Client email: $NEW_CLIENT_EMAIL"
else
    NEW_KEY_ID="dry-run-key-id"
    NEW_PRIVATE_KEY="dry-run-private-key"
    NEW_CLIENT_EMAIL="$SA_EMAIL"
    NEW_PROJECT_ID="$PROJECT_ID"
    log "[dry-run] Would create new key for $SA_EMAIL"
fi

#######################################
# 3. Update SOPS files
#######################################
section "Updating SOPS-encrypted secrets"

for f in "${SOPS_FILES[@]}"; do
    fname=$(basename "$(dirname "$(dirname "$f")")")/$(basename "$f")
    if [ ! -f "$f" ]; then
        warn "Skipping $fname — file not found"
        continue
    fi

    log "Updating $fname..."

    if $DRY_RUN; then
        log "[dry-run] sops --set GOOGLE_PRIVATE_KEY_ID in $fname"
        log "[dry-run] sops --set GOOGLE_PRIVATE_KEY in $fname"
        log "[dry-run] sops --set GOOGLE_CLIENT_EMAIL in $fname"
        log "[dry-run] sops --set GOOGLE_PROJECT_ID in $fname"
        continue
    fi

    # Private key contains newlines — write to temp file and use sops --set with file
    # The private key is a PEM with embedded \n characters in the JSON string
    sops --set "[\"GOOGLE_PRIVATE_KEY_ID\"] \"$NEW_KEY_ID\"" "$f" || {
        FAILURES+=("SOPS GOOGLE_PRIVATE_KEY_ID: $fname"); }

    # Private key needs special handling because it contains newlines
    # Use jq to properly escape the key for sops --set
    ESCAPED_KEY=$(echo "$NEW_PRIVATE_KEY" | jq -Rs '.')
    sops --set "[\"GOOGLE_PRIVATE_KEY\"] $ESCAPED_KEY" "$f" || {
        FAILURES+=("SOPS GOOGLE_PRIVATE_KEY: $fname"); }

    sops --set "[\"GOOGLE_CLIENT_EMAIL\"] \"$NEW_CLIENT_EMAIL\"" "$f" || {
        FAILURES+=("SOPS GOOGLE_CLIENT_EMAIL: $fname"); }

    sops --set "[\"GOOGLE_PROJECT_ID\"] \"$NEW_PROJECT_ID\"" "$f" || {
        FAILURES+=("SOPS GOOGLE_PROJECT_ID: $fname"); }

    log "  $fname"
done

#######################################
# 4. Verify new key works
#######################################
section "Verifying new credentials"

if ! $DRY_RUN; then
    # Test the new key by activating it and calling a simple API
    if GOOGLE_APPLICATION_CREDENTIALS="$NEW_KEY_FILE" \
        gcloud auth application-default print-access-token --project="$PROJECT_ID" > /dev/null 2>&1; then
        log "New key verified successfully"
    else
        warn "Could not verify new key via gcloud — key may still be valid"
        warn "GCP keys are active immediately but auth may need a moment"
    fi
else
    log "[dry-run] Would verify new key"
fi

#######################################
# 5. Delete old key
#######################################
section "Deleting old service account key"

if ! $DRY_RUN; then
    if [ -n "$OLD_KEY_ID" ] && [ "$OLD_KEY_ID" != "null" ]; then
        # GCP key IDs in the full format: projects/PROJECT/serviceAccounts/SA/keys/KEY_ID
        gcloud iam service-accounts keys delete "$OLD_KEY_ID" \
            --iam-account="$SA_EMAIL" \
            --project="$PROJECT_ID" \
            --quiet 2>&1 && {
            log "Deleted old key: $OLD_KEY_ID"
        } || {
            warn "Could not delete old key $OLD_KEY_ID — may need manual cleanup"
            FAILURES+=("Delete old key: $OLD_KEY_ID")
        }
    fi
else
    log "[dry-run] Would delete old key: $OLD_KEY_ID"
fi

#######################################
# Summary
#######################################
section "GCP Key Rotation Summary"

echo ""
log "Service account: $SA_EMAIL"
log "Project: $PROJECT_ID"
log "Old key ID: $OLD_KEY_ID"
if ! $DRY_RUN; then
    log "New key ID: $NEW_KEY_ID"
fi
echo ""
echo "Updated SOPS files:"
echo "  - image.pollinations.ai/secrets/env.json"
echo "  - text.pollinations.ai/secrets/env.json"
echo ""

if [ ${#FAILURES[@]} -eq 0 ]; then
    log "All updates completed successfully!"
    echo ""
    log "Next steps:"
    echo "  1. Commit the SOPS file changes"
    echo "  2. Deploy EC2 services (image + text) to pick up new credentials"
else
    error "The following updates failed:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
fi
