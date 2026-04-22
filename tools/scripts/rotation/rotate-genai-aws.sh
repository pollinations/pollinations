#!/bin/bash
# Rotate AWS IAM access keys used by the image and text EC2 services.
#
# Usage: ./rotate-genai-aws.sh [--execute]
#
# Default: dry-run (verify + preview, no mutation).
#
# Pass --execute to run the full end-to-end cycle:
#   1. Pre-flight (git clean, SOPS, AWS sts, gh, wrangler auth)
#   2. Create new IAM access key (old stays valid)
#   3. Update SOPS (image + text env.json)
#   4. Verify new key works via sts
#   5. Open PR to main, enable auto-merge
#   6. Poll until PR merged
#   7. git push origin main:production (admin push, no PR)
#   8. Watch deploy-enter-services.yml complete
#   9. Health check production endpoint
#  10. Delete old IAM access key
#
# Zero-downtime: old key remains valid until step 10. If anything fails between
# steps 2 and 10, the new key is already live — operator can re-run or clean up.
#
# Prerequisites:
# - aws CLI configured (to call IAM on behalf of the user who owns the keys)
# - sops configured, jq, curl
# - gh CLI authenticated, repo auto-merge enabled
# - git admin permission to push directly to the production branch

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

REPO="pollinations/pollinations"
SOPS_FILES=(
    "$REPO_ROOT/image.pollinations.ai/secrets/env.json"
    "$REPO_ROOT/text.pollinations.ai/secrets/env.json"
)
DEPLOY_WORKFLOW="deploy-enter-services.yml"
GEN_BASE="https://gen.pollinations.ai"
TESTING_TOKENS_FILE="$REPO_ROOT/enter.pollinations.ai/.testingtokens"
HEALTH_MODEL="claude-fast"
HEALTH_EXPECT="bedrock"  # substring expected in .provider or .model

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

IMAGE_SOPS="${SOPS_FILES[0]}"
if [ ! -f "$IMAGE_SOPS" ]; then
    error "SOPS file not found: $IMAGE_SOPS"
    exit 1
fi

OLD_KEY_ID=$(sops -d "$IMAGE_SOPS" | jq -r '.AWS_ACCESS_KEY_ID')
OLD_SECRET=$(sops -d "$IMAGE_SOPS" | jq -r '.AWS_SECRET_ACCESS_KEY')
if [ -z "$OLD_KEY_ID" ] || [ "$OLD_KEY_ID" = "null" ]; then
    error "Could not read AWS_ACCESS_KEY_ID from SOPS."
    exit 1
fi
log "Current AWS access key: $OLD_KEY_ID"

CALLER=$(AWS_ACCESS_KEY_ID="$OLD_KEY_ID" AWS_SECRET_ACCESS_KEY="$OLD_SECRET" \
    aws sts get-caller-identity 2>&1) || {
    error "Current AWS credentials invalid: $CALLER"
    exit 1
}
IAM_ARN=$(echo "$CALLER" | jq -r '.Arn')
IAM_USER=$(echo "$IAM_ARN" | sed 's|.*/||')
log "IAM user: $IAM_USER"

if [ ! -f "$TESTING_TOKENS_FILE" ]; then
    error "Required for provider-specific health check: $TESTING_TOKENS_FILE"
    exit 1
fi
TEST_TOKEN=$(grep -E '^ENTER_API_TOKEN_REMOTE=' "$TESTING_TOKENS_FILE" | head -1 | cut -d= -f2- | tr -d '"')
if [ -z "$TEST_TOKEN" ]; then
    error "ENTER_API_TOKEN_REMOTE missing from $TESTING_TOKENS_FILE"
    exit 1
fi

log "Pre-flight OK"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
    echo
    log "Plan:"
    echo "  1. Create new IAM access key for $IAM_USER (old $OLD_KEY_ID stays valid)"
    echo "  2. Update SOPS: image.pollinations.ai/env.json, text.pollinations.ai/env.json"
    echo "  3. Verify new key via sts"
    echo "  4. Open PR: rotate/aws-<date> → main, auto-merge"
    echo "  5. Push main → production (admin)"
    echo "  6. Watch $DEPLOY_WORKFLOW"
    echo "  7. Health check via $GEN_BASE/v1/chat/completions (model=$HEALTH_MODEL → expect '$HEALTH_EXPECT')"
    echo "  8. Delete old IAM access key $OLD_KEY_ID"
    exit 0
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

#######################################
# 1. Create new IAM access key
#######################################
section "Creating new IAM access key"

NEW_KEY_JSON=$(aws iam create-access-key --user-name "$IAM_USER" 2>&1) || {
    error "Failed to create new IAM key: $NEW_KEY_JSON"
    exit 1
}
NEW_KEY_ID=$(echo "$NEW_KEY_JSON" | jq -r '.AccessKey.AccessKeyId')
NEW_SECRET=$(echo "$NEW_KEY_JSON" | jq -r '.AccessKey.SecretAccessKey')
log "New access key: $NEW_KEY_ID"

#######################################
# 2. Update SOPS
#######################################
section "Updating SOPS-encrypted secrets"

for f in "${SOPS_FILES[@]}"; do
    fname=$(basename "$(dirname "$(dirname "$f")")")/$(basename "$f")
    if [ ! -f "$f" ]; then
        warn "Skipping $fname — file not found"
        continue
    fi
    sops --set "[\"AWS_ACCESS_KEY_ID\"] $(printf '%s' "$NEW_KEY_ID" | jq -Rs .)" "$f"
    sops --set "[\"AWS_SECRET_ACCESS_KEY\"] $(printf '%s' "$NEW_SECRET" | jq -Rs .)" "$f"
    log "  $fname updated"
done

#######################################
# 3. Verify new key
#######################################
section "Verifying new AWS credentials"

log "Waiting 10s for IAM propagation..."
sleep 10

VERIFY=$(AWS_ACCESS_KEY_ID="$NEW_KEY_ID" AWS_SECRET_ACCESS_KEY="$NEW_SECRET" \
    aws sts get-caller-identity 2>&1) || {
    error "New key verification failed: $VERIFY"
    error "Old key $OLD_KEY_ID NOT deleted — resolve manually."
    exit 1
}
log "New key verified: $(echo "$VERIFY" | jq -r '.Arn')"

#######################################
# 4. Open PR to main, auto-merge
#######################################
section "Opening PR and deploying"

BRANCH="rotate/aws-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "${SOPS_FILES[@]}"
git commit -m "rotate: AWS access keys ($IAM_USER)"

open_pr_and_merge "$BRANCH" \
    "rotate: AWS access keys ($IAM_USER)" \
    "Rotates AWS IAM access keys for \`$IAM_USER\`. Old key \`$OLD_KEY_ID\` stays valid until this PR merges, production is promoted, services are redeployed, and health check passes. Automated by \`rotate-genai-aws.sh\`." \
    || exit 1

push_prod_and_watch "$DEPLOY_WORKFLOW" || {
    error "Deploy workflow failed. Old key NOT deleted — resolve manually."
    exit 1
}

#######################################
# 8. Health check (provider-specific)
#######################################
section "Health check ($HEALTH_MODEL → expect '$HEALTH_EXPECT')"

HC_BODY=$(curl -sS --max-time 60 \
    -X POST "$GEN_BASE/v1/chat/completions" \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$HEALTH_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"reply ok\"}],\"max_tokens\":10}")
HC_ERR=$(echo "$HC_BODY" | jq -r '.error.message // ""')
if [ -n "$HC_ERR" ]; then
    error "Health check failed: $HC_ERR"
    error "Body: $HC_BODY"
    error "Old key NOT deleted — resolve manually."
    exit 1
fi
HC_PROVIDER=$(echo "$HC_BODY" | jq -r '.provider // ""')
HC_MODEL=$(echo "$HC_BODY" | jq -r '.model // ""')
if ! echo "$HC_PROVIDER $HC_MODEL" | grep -qiE "$HEALTH_EXPECT"; then
    error "Health check: routing mismatch. provider='$HC_PROVIDER' model='$HC_MODEL' (expected substring '$HEALTH_EXPECT')."
    error "Old key NOT deleted — resolve manually."
    exit 1
fi
log "Health check OK: provider='$HC_PROVIDER' model='$HC_MODEL'"

#######################################
# 9. Delete old IAM access key
#######################################
section "Deleting old IAM access key"

aws iam delete-access-key --user-name "$IAM_USER" --access-key-id "$OLD_KEY_ID" || {
    warn "Could not delete old key $OLD_KEY_ID — delete manually."
}
log "Old key $OLD_KEY_ID deleted."

#######################################
# 10. Restore original branch
#######################################
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout main

section "AWS Key Rotation Complete"
echo ""
log "Old key: $OLD_KEY_ID (deleted)"
log "New key: $NEW_KEY_ID"
echo ""
log "SOPS + production + EC2 services now using the new key."
