#!/bin/bash
# Rotate GCP service account key used by image and text EC2 services.
#
# Usage: ./rotate-genai-gcp.sh [--execute]
#
# Default: dry-run. Pass --execute for the full end-to-end cycle.
#
# Prerequisites:
# - gcloud CLI authenticated with permissions to manage service account keys
# - sops, jq, curl, gh installed
# - Admin permission to push directly to the production branch

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
DEPLOY_WORKFLOW="deploy-enter-services.yml"
HEALTH_URL="https://gen.pollinations.ai/v1/models"

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

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

if ! command -v gcloud >/dev/null; then
    error "gcloud CLI not installed."
    exit 1
fi

IMAGE_SOPS="${SOPS_FILES[0]}"
if [ ! -f "$IMAGE_SOPS" ]; then
    error "SOPS file not found: $IMAGE_SOPS"
    exit 1
fi

SA_EMAIL=$(sops -d "$IMAGE_SOPS" | jq -r '.GOOGLE_CLIENT_EMAIL')
PROJECT_ID=$(sops -d "$IMAGE_SOPS" | jq -r '.GOOGLE_PROJECT_ID')
OLD_KEY_ID=$(sops -d "$IMAGE_SOPS" | jq -r '.GOOGLE_PRIVATE_KEY_ID')

if [ -z "$SA_EMAIL" ] || [ "$SA_EMAIL" = "null" ]; then
    error "Could not read GOOGLE_CLIENT_EMAIL from SOPS."
    exit 1
fi
log "Service account: $SA_EMAIL"
log "Project: $PROJECT_ID"
log "Current key ID: $OLD_KEY_ID"

if ! gcloud iam service-accounts keys list \
    --iam-account="$SA_EMAIL" --project="$PROJECT_ID" \
    --format="value(name)" >/dev/null 2>&1; then
    error "gcloud cannot list keys for $SA_EMAIL — auth/permissions issue."
    exit 1
fi
log "gcloud credentials OK"

log "Pre-flight OK"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
    echo
    log "Plan:"
    echo "  1. Create new SA key for $SA_EMAIL (old $OLD_KEY_ID stays valid)"
    echo "  2. Update SOPS: image + text env.json"
    echo "  3. Verify new key via application-default print-access-token"
    echo "  4. Open PR: rotate/gcp-<date> → main, auto-merge"
    echo "  5. Push main → production (admin)"
    echo "  6. Watch $DEPLOY_WORKFLOW"
    echo "  7. Health check $HEALTH_URL"
    echo "  8. Delete old SA key $OLD_KEY_ID"
    exit 0
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

#######################################
# 1. Create new SA key
#######################################
section "Creating new service account key"

NEW_KEY_FILE="$TEMP_DIR/new-sa-key.json"
gcloud iam service-accounts keys create "$NEW_KEY_FILE" \
    --iam-account="$SA_EMAIL" \
    --project="$PROJECT_ID" 2>&1 || {
    error "Failed to create new SA key."
    exit 1
}

NEW_KEY_ID=$(jq -r '.private_key_id' "$NEW_KEY_FILE")
NEW_PRIVATE_KEY=$(jq -r '.private_key' "$NEW_KEY_FILE")
NEW_CLIENT_EMAIL=$(jq -r '.client_email' "$NEW_KEY_FILE")
NEW_PROJECT_ID=$(jq -r '.project_id' "$NEW_KEY_FILE")
log "New key ID: $NEW_KEY_ID"

#######################################
# 2. Update SOPS
#######################################
section "Updating SOPS-encrypted secrets"

ESCAPED_KEY=$(echo "$NEW_PRIVATE_KEY" | jq -Rs '.')
for f in "${SOPS_FILES[@]}"; do
    fname=$(basename "$(dirname "$(dirname "$f")")")/$(basename "$f")
    if [ ! -f "$f" ]; then
        warn "Skipping $fname — file not found"
        continue
    fi
    sops --set "[\"GOOGLE_PRIVATE_KEY_ID\"] \"$NEW_KEY_ID\"" "$f"
    sops --set "[\"GOOGLE_PRIVATE_KEY\"] $ESCAPED_KEY" "$f"
    sops --set "[\"GOOGLE_CLIENT_EMAIL\"] \"$NEW_CLIENT_EMAIL\"" "$f"
    sops --set "[\"GOOGLE_PROJECT_ID\"] \"$NEW_PROJECT_ID\"" "$f"
    log "  $fname updated"
done

#######################################
# 3. Verify new key
#######################################
section "Verifying new SA credentials"

if GOOGLE_APPLICATION_CREDENTIALS="$NEW_KEY_FILE" \
    gcloud auth application-default print-access-token --project="$PROJECT_ID" > /dev/null 2>&1; then
    log "New key verified."
else
    warn "Could not verify new key via gcloud — continuing (may need a moment to propagate)."
fi

#######################################
# 4. Open PR to main, auto-merge
#######################################
section "Opening PR to main"

BRANCH="rotate/gcp-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "${SOPS_FILES[@]}"
git commit -m "rotate: GCP SA key ($SA_EMAIL)"
git push -u origin "$BRANCH"

gh pr create \
    --base main \
    --head "$BRANCH" \
    --title "rotate: GCP SA key ($SA_EMAIL)" \
    --body "Rotates GCP service account key for \`$SA_EMAIL\`. Old key \`$OLD_KEY_ID\` stays valid until this PR merges, production is promoted, services are redeployed, and health check passes. Automated by \`rotate-genai-gcp.sh\`."

log "Enabling auto-merge..."
gh pr merge "$BRANCH" --auto --squash

#######################################
# 5. Poll until PR merged
#######################################
section "Waiting for PR to merge"

MERGE_TIMEOUT=900
MERGE_ELAPSED=0
while true; do
    STATE=$(gh pr view "$BRANCH" --json state -q .state 2>/dev/null || echo "UNKNOWN")
    case "$STATE" in
        MERGED) log "PR merged."; break ;;
        CLOSED) error "PR was closed without merging."; exit 1 ;;
    esac
    if [ "$MERGE_ELAPSED" -ge "$MERGE_TIMEOUT" ]; then
        error "Timed out waiting for PR merge after ${MERGE_TIMEOUT}s."
        exit 1
    fi
    sleep 15
    MERGE_ELAPSED=$((MERGE_ELAPSED + 15))
done

#######################################
# 6. Push main → production
#######################################
section "Promoting main → production"

git checkout main
git pull --ff-only origin main
git fetch origin production
git push origin main:production
log "production advanced to main."

#######################################
# 7. Watch deploy workflow
#######################################
section "Waiting for $DEPLOY_WORKFLOW"

sleep 10
RUN_ID=$(gh run list --workflow="$DEPLOY_WORKFLOW" --branch=production --limit=1 --json databaseId -q '.[0].databaseId')
if [ -z "$RUN_ID" ]; then
    error "No deploy run found for $DEPLOY_WORKFLOW on production."
    exit 1
fi
log "Watching run $RUN_ID..."
gh run watch "$RUN_ID" --exit-status || {
    error "Deploy workflow failed. Old key NOT deleted — resolve manually."
    exit 1
}

#######################################
# 8. Health check
#######################################
section "Health check"

STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 30 "$HEALTH_URL")
if [ "$STATUS" != "200" ]; then
    error "Health check failed (HTTP $STATUS). Old key NOT deleted — resolve manually."
    exit 1
fi
log "Production healthy (HTTP 200)."

#######################################
# 9. Delete old SA key
#######################################
section "Deleting old service account key"

if [ -n "$OLD_KEY_ID" ] && [ "$OLD_KEY_ID" != "null" ]; then
    gcloud iam service-accounts keys delete "$OLD_KEY_ID" \
        --iam-account="$SA_EMAIL" \
        --project="$PROJECT_ID" \
        --quiet 2>&1 || {
        warn "Could not delete old key $OLD_KEY_ID — delete manually."
    }
    log "Old key $OLD_KEY_ID deleted."
fi

#######################################
# 10. Restore original branch
#######################################
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout main

section "GCP Key Rotation Complete"
echo ""
log "Old key: $OLD_KEY_ID (deleted)"
log "New key: $NEW_KEY_ID"
log "SA: $SA_EMAIL"
echo ""
log "SOPS + production + EC2 services now using the new key."
