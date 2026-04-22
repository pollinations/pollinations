#!/bin/bash
# Rotate ELEVENLABS_API_KEY (runtime) using the "rotate" service account.
#
# Usage: ./rotate-genai-elevenlabs.sh [--execute]
#
# Default: dry-run. Pass --execute for the full end-to-end cycle.
#
# Two distinct credentials:
#   ELEVENLABS_ADMIN_API_KEY       — static, authenticates SA management calls
#   ELEVENLABS_SERVICE_ACCOUNT_ID  — user_id of the SA whose keys we rotate
#   ELEVENLABS_API_KEY (enter SOPS) — runtime TTS/STT key that this script rotates
#
# On first run, runtime key may be a personal key (not under SA); script warns
# and skips auto-delete in that case.

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

source "$SCRIPT_DIR/_load-admin-secrets.sh"

REPO="pollinations/pollinations"
ENTER_DIR="$REPO_ROOT/enter.pollinations.ai"
API_BASE="https://api.elevenlabs.io/v1"
SOPS_FILES=(
    "$ENTER_DIR/secrets/dev.vars.json"
    "$ENTER_DIR/secrets/staging.vars.json"
    "$ENTER_DIR/secrets/prod.vars.json"
)
DEPLOY_WORKFLOW="deploy-enter-cloudflare.yml"
GEN_BASE="https://gen.pollinations.ai"
TESTING_TOKENS_FILE="$REPO_ROOT/enter.pollinations.ai/.testingtokens"
HEALTH_MODEL="elevenlabs"  # routes via ElevenLabs TTS

wrangler_cmd() {
    if [ -x "$REPO_ROOT/node_modules/.bin/wrangler" ]; then
        "$REPO_ROOT/node_modules/.bin/wrangler" "$@"
    else
        npx wrangler "$@"
    fi
}

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

if ! wrangler_cmd whoami >/dev/null 2>&1; then
    error "wrangler not authenticated."
    exit 1
fi

if [ -z "$ELEVENLABS_SERVICE_ACCOUNT_ID" ] || [ -z "$ELEVENLABS_ADMIN_API_KEY" ]; then
    error "ELEVENLABS_SERVICE_ACCOUNT_ID + ELEVENLABS_ADMIN_API_KEY must be set."
    exit 1
fi

SA_URL="$API_BASE/service-accounts/$ELEVENLABS_SERVICE_ACCOUNT_ID/api-keys"

LIST_RESPONSE=$(curl -sS --fail-with-body --max-time 15 \
    -H "xi-api-key: $ELEVENLABS_ADMIN_API_KEY" \
    "$SA_URL") || {
    error "Admin key cannot list SA keys. Ensure workspace_read + workspace_write permissions."
    exit 1
}
CURRENT_SA_KEY_COUNT=$(echo "$LIST_RESPONSE" | jq '."api-keys" | length')
log "Admin key OK — $CURRENT_SA_KEY_COUNT key(s) currently under SA"

PROD_SOPS="${SOPS_FILES[2]}"
if [ ! -f "$PROD_SOPS" ]; then
    error "SOPS file not found: $PROD_SOPS"
    exit 1
fi

OLD_KEY=$(sops -d "$PROD_SOPS" | jq -r '.ELEVENLABS_API_KEY')
if [ -z "$OLD_KEY" ] || [ "$OLD_KEY" = "null" ]; then
    error "Could not read ELEVENLABS_API_KEY from SOPS."
    exit 1
fi
log "Current runtime key: ${OLD_KEY:0:4}..."

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
    echo "  1. Create new SA key (admin-authed, old stays valid)"
    echo "  2. Update SOPS: enter {dev,staging,prod}.vars.json"
    echo "  3. Update Wrangler secrets (prod + staging)"
    echo "  4. Open PR: rotate/elevenlabs-<date> → main, auto-merge"
    echo "  5. Push main → production (admin)"
    echo "  6. Watch $DEPLOY_WORKFLOW"
    echo "  7. Health check via $GEN_BASE/v1/audio/speech (model=$HEALTH_MODEL → expect HTTP 200 + audio/*)"
    echo "  8. Delete old SA key (if locatable; may be personal key on first run)"
    exit 0
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

#######################################
# 1. Locate old key under SA (best-effort)
#######################################
section "Locating old key under SA"

OLD_KEY_HINT="${OLD_KEY: -4}"
OLD_KEY_ID=$(echo "$LIST_RESPONSE" | jq -r --arg h "$OLD_KEY_HINT" \
    '."api-keys"[] | select(.hint == $h) | .key_id' | head -1)

if [ -n "$OLD_KEY_ID" ]; then
    log "Old key found under SA: $OLD_KEY_ID"
else
    warn "Old runtime key not under SA (hint: $OLD_KEY_HINT) — personal key? Revoke manually after rotation."
fi

#######################################
# 2. Create new SA key
#######################################
section "Creating new service account key"

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
log "New key: ${NEW_KEY:0:4}... (ID: $NEW_KEY_ID)"

#######################################
# 3. Update SOPS
#######################################
section "Updating SOPS"

for f in "${SOPS_FILES[@]}"; do
    fname=$(basename "$f")
    sops --set "[\"ELEVENLABS_API_KEY\"] $(printf '%s' "$NEW_KEY" | jq -Rs .)" "$f"
    log "  $fname updated"
done

#######################################
# 4. Update Wrangler secrets
#######################################
section "Updating Wrangler secrets (enter.pollinations.ai)"

for env in production staging; do
    echo "$NEW_KEY" | wrangler_cmd secret put ELEVENLABS_API_KEY --env "$env" --config "$ENTER_DIR/wrangler.toml" || {
        error "Failed to update Wrangler secret for $env."
        exit 1
    }
    log "  wrangler: $env"
done

#######################################
# 5. Open PR to main, auto-merge
#######################################
section "Opening PR to main"

BRANCH="rotate/elevenlabs-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "${SOPS_FILES[@]}"
git commit -m "rotate: ElevenLabs API key"
git push -u origin "$BRANCH"

gh pr create --repo "$REPO" \
    --base main \
    --head "$BRANCH" \
    --title "rotate: ElevenLabs API key" \
    --body "Rotates \`ELEVENLABS_API_KEY\` runtime key (new SA key). Wrangler already has the new value live. This PR syncs SOPS + triggers a worker redeploy via production. Automated by \`rotate-genai-elevenlabs.sh\`."

log "Enabling auto-merge..."
gh pr merge "$BRANCH" --repo "$REPO" --auto --squash

#######################################
# 6. Poll until PR merged
#######################################
section "Waiting for PR to merge"

MERGE_TIMEOUT=900
MERGE_ELAPSED=0
while true; do
    STATE=$(gh pr view "$BRANCH" --repo "$REPO" --json state -q .state 2>/dev/null || echo "UNKNOWN")
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
# 7. Push main → production
#######################################
section "Promoting main → production"

git checkout main
git pull --ff-only origin main
PROD_SHA=$(git rev-parse main)
git fetch origin production
git push origin main:production
log "production advanced to main ($PROD_SHA)."

#######################################
# 8. Watch deploy workflow
#######################################
section "Waiting for $DEPLOY_WORKFLOW"

RUN_ID=""
for _ in $(seq 1 12); do
    sleep 10
    RUN_ID=$(gh run list --workflow="$DEPLOY_WORKFLOW" --branch=production --commit="$PROD_SHA" --limit=1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)
    [ -n "$RUN_ID" ] && break
done
if [ -z "$RUN_ID" ]; then
    error "No deploy run found for $DEPLOY_WORKFLOW on production at $PROD_SHA."
    exit 1
fi
log "Watching run $RUN_ID..."
gh run watch "$RUN_ID" --exit-status || {
    error "Deploy workflow failed. Old key NOT deleted — resolve manually."
    exit 1
}

#######################################
# 9. Health check (provider-specific)
#######################################
section "Health check ($HEALTH_MODEL → audio synthesis via ElevenLabs)"

HC_TMP=$(mktemp)
trap 'rm -f "$HC_TMP"' EXIT
HC_META=$(curl -sS --max-time 60 -o "$HC_TMP" \
    -w "%{http_code}|%{content_type}|%{size_download}" \
    -X POST "$GEN_BASE/v1/audio/speech" \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$HEALTH_MODEL\",\"input\":\"hi\",\"voice\":\"alloy\"}")
HC_CODE="${HC_META%%|*}"
HC_REST="${HC_META#*|}"
HC_CT="${HC_REST%%|*}"
HC_SIZE="${HC_REST#*|}"
if [ "$HC_CODE" != "200" ] || ! echo "$HC_CT" | grep -q "^audio/"; then
    error "Health check failed: HTTP $HC_CODE content-type=$HC_CT"
    error "Body preview: $(head -c 500 "$HC_TMP")"
    error "Old key NOT deleted — resolve manually."
    exit 1
fi
log "Health check OK: $HEALTH_MODEL → $HC_CT, $HC_SIZE bytes"
rm -f "$HC_TMP"; trap - EXIT

#######################################
# 10. Delete old SA key (if under SA)
#######################################
section "Deleting old SA key"

if [ -n "$OLD_KEY_ID" ]; then
    DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -X DELETE "$SA_URL/$OLD_KEY_ID" \
        -H "xi-api-key: $ELEVENLABS_ADMIN_API_KEY")
    if [ "$DELETE_STATUS" = "200" ]; then
        log "Old SA key deleted (ID: $OLD_KEY_ID)."
    else
        warn "Delete returned HTTP $DELETE_STATUS — check manually."
    fi
else
    warn "Old runtime key was not under SA — revoke manually in ElevenLabs UI."
fi

#######################################
# 11. Restore original branch
#######################################
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout main

section "ElevenLabs Key Rotation Complete"
echo ""
log "Old runtime key: ${OLD_KEY:0:4}..."
log "New runtime key: ${NEW_KEY:0:4}..."
echo ""
log "SOPS + Wrangler + production worker now using the new key."
