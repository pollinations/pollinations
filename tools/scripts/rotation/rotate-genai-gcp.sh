#!/bin/bash
# Rotate GCP service account key used by gen image and text providers.
#
# Usage: ./rotate-genai-gcp.sh [--execute]
#
# Default: dry-run. Pass --execute for the full end-to-end cycle.
#
# Prerequisites:
# - gcloud CLI installed (any account — the script authenticates via a dedicated
#   `key-rotator` service account loaded from SOPS, leaving the operator's
#   default gcloud account untouched).
# - tools/scripts/rotation/secrets.vars.json contains `GCP_ROTATION_SA_KEY`
#   (the JSON key for `key-rotator@stellar-verve-465920-b7.iam.gserviceaccount.com`,
#   which has `roles/iam.serviceAccountKeyAdmin` scoped to the runtime SA only).
# - sops, jq, curl, gh installed
# - enter.pollinations.ai/.testingtokens with ENTER_API_TOKEN_REMOTE
# - Admin permission to push directly to the production branch
#
# Bootstrap note: the `key-rotator` SA's own key is NOT rotated by this script
# (would be circular). Rotate manually via the GCP Console once a year.

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
ROTATION_SECRETS="$SCRIPT_DIR/secrets.vars.json"
ROTATOR_SA_EMAIL="key-rotator@stellar-verve-465920-b7.iam.gserviceaccount.com"

SOPS_FILES=(
    "$REPO_ROOT/gen.pollinations.ai/secrets/dev.vars.json"
    "$REPO_ROOT/gen.pollinations.ai/secrets/staging.vars.json"
    "$REPO_ROOT/gen.pollinations.ai/secrets/prod.vars.json"
)
DEPLOY_WORKFLOW="deploy-gen-cloudflare.yml"
GEN_BASE="https://gen.pollinations.ai"
TESTING_TOKENS_FILE="$REPO_ROOT/enter.pollinations.ai/.testingtokens"
HEALTH_MODEL="gemini-large"
HEALTH_EXPECT="vertex-ai|gemini"  # substring expected in .provider or .model

TEMP_DIR=$(mktemp -d)
# EXIT trap is set later after the isolated gcloud config is created so cleanup
# can also delete that config. See line ~127.

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

SOPS_READ="${SOPS_FILES[0]}"
for f in "${SOPS_FILES[@]}"; do
    if [ ! -f "$f" ]; then
        error "SOPS file not found: $f"
        exit 1
    fi
done

SA_EMAIL=$(sops -d "$SOPS_READ" | jq -r '.GOOGLE_CLIENT_EMAIL')
PROJECT_ID=$(sops -d "$SOPS_READ" | jq -r '.GOOGLE_PROJECT_ID')
OLD_KEY_ID=$(sops -d "$SOPS_READ" | jq -r '.GOOGLE_PRIVATE_KEY_ID')

if [ -z "$SA_EMAIL" ] || [ "$SA_EMAIL" = "null" ]; then
    error "Could not read GOOGLE_CLIENT_EMAIL from SOPS."
    exit 1
fi
log "Service account: $SA_EMAIL"
log "Project: $PROJECT_ID"
log "Current key ID: $OLD_KEY_ID"

if [ ! -f "$ROTATION_SECRETS" ]; then
    error "Rotation secrets not found: $ROTATION_SECRETS"
    exit 1
fi
ROTATOR_KEY_JSON=$(sops -d "$ROTATION_SECRETS" 2>/dev/null | jq -r '.GCP_ROTATION_SA_KEY // empty')
if [ -z "$ROTATOR_KEY_JSON" ]; then
    error "GCP_ROTATION_SA_KEY missing from $ROTATION_SECRETS"
    error "Generate a JSON key for $ROTATOR_SA_EMAIL via the GCP Console and add it to SOPS:"
    error "  sops --set \"[\\\"GCP_ROTATION_SA_KEY\\\"] \$(jq -Rs . < <key.json>)\" $ROTATION_SECRETS"
    exit 1
fi

# Write key to a temp file so gcloud can activate the SA. Cleaned up on exit.
ROTATOR_KEY_FILE="$TEMP_DIR/key-rotator.json"
echo "$ROTATOR_KEY_JSON" > "$ROTATOR_KEY_FILE"
chmod 600 "$ROTATOR_KEY_FILE"

# Use an isolated gcloud configuration so the user's default account/project
# stays untouched. CLOUDSDK_ACTIVE_CONFIG_NAME is exported for the rest of the
# script — every gcloud call below runs against this scratch config.
export CLOUDSDK_ACTIVE_CONFIG_NAME="pollinations-key-rotator-$$"
gcloud config configurations create "$CLOUDSDK_ACTIVE_CONFIG_NAME" --quiet >/dev/null 2>&1
# Cleanup must (1) flip on-disk active back to default so gcloud lets us delete
# the scratch config, then (2) delete it. Unsetting CLOUDSDK_ACTIVE_CONFIG_NAME
# inside the trap subshell isn't enough — gcloud reads ~/.config/gcloud/active_config.
trap '
    rm -rf "$TEMP_DIR";
    unset CLOUDSDK_ACTIVE_CONFIG_NAME;
    gcloud config configurations activate default --quiet >/dev/null 2>&1 || true;
    gcloud config configurations delete "pollinations-key-rotator-'$$'" --quiet >/dev/null 2>&1 || true
' EXIT

if ! gcloud auth activate-service-account "$ROTATOR_SA_EMAIL" \
    --key-file="$ROTATOR_KEY_FILE" --quiet >/dev/null 2>&1; then
    error "Failed to activate $ROTATOR_SA_EMAIL — key may be revoked."
    exit 1
fi
gcloud config set project "$PROJECT_ID" --quiet >/dev/null 2>&1

if ! gcloud iam service-accounts keys list \
    --iam-account="$SA_EMAIL" --project="$PROJECT_ID" \
    --format="value(name)" >/dev/null 2>&1; then
    error "$ROTATOR_SA_EMAIL cannot list keys for $SA_EMAIL on $PROJECT_ID."
    error "Verify it has roles/iam.serviceAccountKeyAdmin on $SA_EMAIL,"
    error "and that the IAM API is enabled on the project."
    exit 1
fi
log "Authenticated as $ROTATOR_SA_EMAIL in isolated gcloud config (user's default untouched)"

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
    echo "  1. Create new SA key for $SA_EMAIL (old $OLD_KEY_ID stays valid)"
    echo "  2. Update SOPS: image + text env.json"
    echo "  3. Verify new key via application-default print-access-token"
    echo "  4. Open PR: rotate/gcp-<date> → main, auto-merge"
    echo "  5. Push main → production (admin)"
    echo "  6. Watch $DEPLOY_WORKFLOW"
    echo "  7. Health check via $GEN_BASE/v1/chat/completions (model=$HEALTH_MODEL → expect '$HEALTH_EXPECT')"
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
    sops --set "[\"GOOGLE_PRIVATE_KEY_ID\"] $(printf '%s' "$NEW_KEY_ID" | jq -Rs .)" "$f"
    sops --set "[\"GOOGLE_PRIVATE_KEY\"] $ESCAPED_KEY" "$f"
    sops --set "[\"GOOGLE_CLIENT_EMAIL\"] $(printf '%s' "$NEW_CLIENT_EMAIL" | jq -Rs .)" "$f"
    sops --set "[\"GOOGLE_PROJECT_ID\"] $(printf '%s' "$NEW_PROJECT_ID" | jq -Rs .)" "$f"
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
# 4. PR + deploy
#######################################
section "Opening PR and deploying"

BRANCH="rotate/gcp-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "${SOPS_FILES[@]}"
git commit -m "rotate: GCP SA key ($SA_EMAIL)"

open_pr_and_merge "$BRANCH" \
    "rotate: GCP SA key ($SA_EMAIL)" \
    "Rotates GCP service account key for \`$SA_EMAIL\`. Old key \`$OLD_KEY_ID\` stays valid until this PR merges, production is promoted, services are redeployed, and health check passes. Automated by \`rotate-genai-gcp.sh\`." \
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
    -d "{\"model\":\"$HEALTH_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"reply ok\"}],\"max_tokens\":50}")
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
log "SOPS + production + gen worker now using the new key."
