#!/bin/bash
# Rotate AWS IAM access keys used by the image and text EC2 services.
#
# Usage: ./rotate-genai-aws.sh [--execute]
#
# Default: dry-run (verify credentials + preview, no mutation).
# Pass --execute to actually rotate.
#
# This script:
# 1. Reads the current access key ID from SOPS
# 2. Creates a new IAM access key for the same user
# 3. Updates both SOPS files (image + text)
# 4. Verifies the new key works (sts get-caller-identity)
# 5. Deletes the old key
#
# The old key is kept until the new one is verified. If verification
# fails, the script exits without deleting the old key.
#
# Prerequisites:
# - aws CLI configured with permissions to manage IAM keys
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

SOPS_FILES=(
    "$REPO_ROOT/image.pollinations.ai/secrets/env.json"
    "$REPO_ROOT/text.pollinations.ai/secrets/env.json"
)

FAILURES=()

#######################################
# Pre-flight: read current creds + verify they work
#######################################
section "Pre-flight: reading current AWS credentials from SOPS"

IMAGE_SOPS="${SOPS_FILES[0]}"

if [ ! -f "$IMAGE_SOPS" ]; then
    error "SOPS file not found: $IMAGE_SOPS"
    exit 1
fi

OLD_KEY_ID=$(sops -d "$IMAGE_SOPS" | jq -r '.AWS_ACCESS_KEY_ID')
OLD_SECRET=$(sops -d "$IMAGE_SOPS" | jq -r '.AWS_SECRET_ACCESS_KEY')
if [ -z "$OLD_KEY_ID" ] || [ "$OLD_KEY_ID" = "null" ]; then
    error "Could not read AWS_ACCESS_KEY_ID from SOPS"
    exit 1
fi
log "Current key ID: $OLD_KEY_ID"

section "Pre-flight: verifying AWS credentials"
CALLER=$(AWS_ACCESS_KEY_ID="$OLD_KEY_ID" AWS_SECRET_ACCESS_KEY="$OLD_SECRET" \
    aws sts get-caller-identity 2>&1) || {
    error "AWS credentials invalid: $CALLER"
    exit 1
}
log "AWS credentials valid: $(echo "$CALLER" | jq -r '.Arn')"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
fi

#######################################
# 2. Identify the IAM user
#######################################
section "Identifying IAM user for key $OLD_KEY_ID"

if ! $DRY_RUN; then
    # Use the current credentials to identify the user
    OLD_SECRET=$(sops -d "$IMAGE_SOPS" | jq -r '.AWS_SECRET_ACCESS_KEY')
    CALLER_INFO=$(AWS_ACCESS_KEY_ID="$OLD_KEY_ID" AWS_SECRET_ACCESS_KEY="$OLD_SECRET" \
        aws sts get-caller-identity 2>&1) || {
        error "Cannot identify current key owner: $CALLER_INFO"
        exit 1
    }
    IAM_ARN=$(echo "$CALLER_INFO" | jq -r '.Arn')
    # Extract username from ARN (arn:aws:iam::ACCOUNT:user/USERNAME)
    IAM_USER=$(echo "$IAM_ARN" | sed 's|.*/||')
    log "IAM user: $IAM_USER (ARN: $IAM_ARN)"
else
    IAM_USER="<detected-at-runtime>"
    log "[dry-run] Would detect IAM user from current key"
fi

#######################################
# 3. Create new access key
#######################################
section "Creating new access key"

if ! $DRY_RUN; then
    NEW_KEY_JSON=$(aws iam create-access-key --user-name "$IAM_USER" 2>&1) || {
        error "Failed to create new key: $NEW_KEY_JSON"
        exit 1
    }
    NEW_KEY_ID=$(echo "$NEW_KEY_JSON" | jq -r '.AccessKey.AccessKeyId')
    NEW_SECRET=$(echo "$NEW_KEY_JSON" | jq -r '.AccessKey.SecretAccessKey')
    log "New key ID: $NEW_KEY_ID"
else
    NEW_KEY_ID="AKIA_DRY_RUN_EXAMPLE"
    NEW_SECRET="dry-run-secret"
    log "[dry-run] Would create new IAM access key for $IAM_USER"
fi

#######################################
# 4. Update SOPS files
#######################################
section "Updating SOPS-encrypted secrets"

for f in "${SOPS_FILES[@]}"; do
    fname=$(basename "$(dirname "$(dirname "$f")")")/$(basename "$f")
    if [ ! -f "$f" ]; then
        warn "Skipping $fname — file not found"
        continue
    fi
    run "sops --set AWS_ACCESS_KEY_ID in $fname" \
        "sops --set '[\"AWS_ACCESS_KEY_ID\"] \"$NEW_KEY_ID\"' '$f'"
    if [ $? -eq 0 ]; then
        log "  AWS_ACCESS_KEY_ID in $fname"
    else
        error "  AWS_ACCESS_KEY_ID in $fname"
        FAILURES+=("SOPS AWS_ACCESS_KEY_ID: $fname")
    fi

    run "sops --set AWS_SECRET_ACCESS_KEY in $fname" \
        "sops --set '[\"AWS_SECRET_ACCESS_KEY\"] \"$NEW_SECRET\"' '$f'"
    if [ $? -eq 0 ]; then
        log "  AWS_SECRET_ACCESS_KEY in $fname"
    else
        error "  AWS_SECRET_ACCESS_KEY in $fname"
        FAILURES+=("SOPS AWS_SECRET_ACCESS_KEY: $fname")
    fi
done

#######################################
# 5. Verify new key works
#######################################
section "Verifying new credentials"

if ! $DRY_RUN; then
    # AWS keys can take a few seconds to propagate
    log "Waiting 10s for IAM propagation..."
    sleep 10

    VERIFY=$(AWS_ACCESS_KEY_ID="$NEW_KEY_ID" AWS_SECRET_ACCESS_KEY="$NEW_SECRET" \
        aws sts get-caller-identity 2>&1) || {
        error "New key verification failed: $VERIFY"
        error "Old key ($OLD_KEY_ID) NOT deleted — fix manually"
        exit 1
    }
    log "Verified: $(echo "$VERIFY" | jq -r '.Arn')"
else
    log "[dry-run] Would verify new key with sts get-caller-identity"
fi

#######################################
# 6. Delete old key
#######################################
section "Deleting old access key"

run "aws iam delete-access-key $OLD_KEY_ID" \
    "aws iam delete-access-key --user-name '$IAM_USER' --access-key-id '$OLD_KEY_ID'"
if [ $? -eq 0 ]; then
    log "Deleted old key: $OLD_KEY_ID"
else
    error "Failed to delete old key: $OLD_KEY_ID"
    FAILURES+=("Delete old key: $OLD_KEY_ID")
fi

#######################################
# Summary
#######################################
section "AWS Key Rotation Summary"

echo ""
log "Old key: $OLD_KEY_ID (deleted)"
if ! $DRY_RUN; then
    log "New key: $NEW_KEY_ID"
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
