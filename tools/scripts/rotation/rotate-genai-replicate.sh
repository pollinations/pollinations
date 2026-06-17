#!/bin/bash
# Rotate REPLICATE_API_TOKEN.
#
# Replicate has NO public token CRUD API — operator must create + delete tokens
# via the web UI at https://replicate.com/account/api-tokens. This script
# automates everything between those two manual steps.
#
# Usage:
#   ./rotate-genai-replicate.sh              # dry run (default)
#   REPLICATE_NEW_TOKEN=r8_xxx \
#     POLLINATIONS_SK_TOKEN=sk_xxx \
#     ./rotate-genai-replicate.sh --execute
#
# Environment:
#   REPLICATE_NEW_TOKEN   — fresh token created in the Replicate UI (required for --execute)
#   POLLINATIONS_SK_TOKEN — Pollinations sk_ key for end-to-end smoke test (optional but recommended)

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
source "$SCRIPT_DIR/_load-admin-secrets.sh"

REPO="pollinations/pollinations"
GEN_SOPS_FILES=(
    "$REPO_ROOT/gen.pollinations.ai/secrets/dev.vars.json"
    "$REPO_ROOT/gen.pollinations.ai/secrets/staging.vars.json"
    "$REPO_ROOT/gen.pollinations.ai/secrets/prod.vars.json"
)
GEN_SOPS_READ="${GEN_SOPS_FILES[0]}"
API_BASE="https://api.replicate.com/v1"
DEPLOY_WORKFLOW="deploy-gen-cloudflare.yml"
SMOKE_MODEL="bytedance/seedance-2.0"
GEN_PROD_URL="${GEN_PROD_URL:-https://gen.pollinations.ai}"

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

for f in "${GEN_SOPS_FILES[@]}"; do
    if [ ! -f "$f" ]; then
        error "SOPS file not found: $f"
        exit 1
    fi
done

OLD_TOKEN=$(sops -d "$GEN_SOPS_READ" | jq -r '.REPLICATE_API_TOKEN')
if [ -z "$OLD_TOKEN" ] || [ "$OLD_TOKEN" = "null" ]; then
    error "Could not read REPLICATE_API_TOKEN from SOPS."
    exit 1
fi
log "Current token prefix: ${OLD_TOKEN:0:10}..."

if ! $DRY_RUN; then
    if [ -z "$REPLICATE_NEW_TOKEN" ]; then
        error "REPLICATE_NEW_TOKEN not set."
        echo
        echo "Replicate does not expose a token CRUD API. To rotate:"
        echo "  1. Visit https://replicate.com/account/api-tokens"
        echo "  2. Create a new token named 'pollinations-gen-rotated-$(date +%Y%m%d-%H%M%S)'"
        echo "  3. Re-run with REPLICATE_NEW_TOKEN=<value> ./rotate-genai-replicate.sh --execute"
        exit 1
    fi
    if [[ ! "$REPLICATE_NEW_TOKEN" =~ ^r8_ ]]; then
        error "REPLICATE_NEW_TOKEN does not look like a Replicate token (expected r8_ prefix)."
        exit 1
    fi
    if [ "$REPLICATE_NEW_TOKEN" = "$OLD_TOKEN" ]; then
        error "REPLICATE_NEW_TOKEN equals current token — nothing to rotate."
        exit 1
    fi
fi

# Validate current token is alive
CURRENT_OK=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 \
    "$API_BASE/account" \
    -H "Authorization: Bearer $OLD_TOKEN")
if [ "$CURRENT_OK" != "200" ]; then
    warn "Current Replicate token returned HTTP $CURRENT_OK on /v1/account — may already be invalid."
fi

log "Pre-flight OK"

if $DRY_RUN; then
    warn "DRY RUN — pass --execute (with REPLICATE_NEW_TOKEN set) to rotate."
    log "Old token prefix that will be deleted: ${OLD_TOKEN:0:10}..."
    exit 0
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

#######################################
# 1. Validate new token
#######################################
section "Validating new Replicate token"

NEW_ACCOUNT=$(curl -sS --fail-with-body --max-time 30 \
    "$API_BASE/account" \
    -H "Authorization: Bearer $REPLICATE_NEW_TOKEN") || {
    error "New Replicate token invalid: $NEW_ACCOUNT"
    exit 1
}
NEW_USERNAME=$(echo "$NEW_ACCOUNT" | jq -r '.username')
log "New token authenticated as: $NEW_USERNAME"
if [ "$NEW_USERNAME" != "myceli-ai" ]; then
    error "Token username '$NEW_USERNAME' is not myceli-ai — refusing to rotate."
    exit 1
fi

#######################################
# 2. Update SOPS
#######################################
section "Updating SOPS"

for f in "${GEN_SOPS_FILES[@]}"; do
    sops --set "[\"REPLICATE_API_TOKEN\"] $(printf '%s' "$REPLICATE_NEW_TOKEN" | jq -Rs .)" "$f"
    log "  $(basename "$f") updated"
done

#######################################
# 3. Direct Replicate smoke test
#######################################
section "Direct Replicate smoke test ($SMOKE_MODEL 480p × 4s)"

SMOKE_PAYLOAD=$(jq -n \
    '{
        input: {
            prompt: "a single goldfish swimming in a glass bowl, daylight",
            duration: 4,
            resolution: "480p",
            aspect_ratio: "16:9",
            generate_audio: false
        }
    }')

SMOKE_RESPONSE=$(curl -sS --fail-with-body --max-time 180 \
    -X POST "$API_BASE/models/$SMOKE_MODEL/predictions" \
    -H "Authorization: Bearer $REPLICATE_NEW_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Prefer: wait=60" \
    -d "$SMOKE_PAYLOAD") || {
    error "Direct smoke failed (POST /predictions): $SMOKE_RESPONSE"
    exit 1
}

SMOKE_STATUS=$(echo "$SMOKE_RESPONSE" | jq -r '.status')
SMOKE_ID=$(echo "$SMOKE_RESPONSE" | jq -r '.id')
log "Smoke prediction $SMOKE_ID status: $SMOKE_STATUS"

# Poll if not yet succeeded
SMOKE_POLL_URL=$(echo "$SMOKE_RESPONSE" | jq -r '.urls.get // empty')
if [ -z "$SMOKE_POLL_URL" ]; then
    SMOKE_POLL_URL="$API_BASE/predictions/$SMOKE_ID"
fi
SMOKE_ATTEMPT=0
while [ "$SMOKE_STATUS" != "succeeded" ] && [ "$SMOKE_STATUS" != "failed" ] && [ "$SMOKE_STATUS" != "canceled" ] && [ $SMOKE_ATTEMPT -lt 60 ]; do
    sleep 3
    SMOKE_ATTEMPT=$((SMOKE_ATTEMPT + 1))
    SMOKE_POLL=$(curl -sS --max-time 30 \
        "$SMOKE_POLL_URL" \
        -H "Authorization: Bearer $REPLICATE_NEW_TOKEN")
    SMOKE_STATUS=$(echo "$SMOKE_POLL" | jq -r '.status')
done

if [ "$SMOKE_STATUS" != "succeeded" ]; then
    error "Smoke prediction did not succeed (status=$SMOKE_STATUS). Old key NOT deleted."
    echo "$SMOKE_POLL" | jq '{id, status, error}' || true
    exit 1
fi
log "Direct Replicate smoke succeeded ($SMOKE_ID)."

#######################################
# 4. PR + deploy
#######################################
section "Opening PR and deploying"

BRANCH="rotate/replicate-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "${GEN_SOPS_FILES[@]}"
git commit -m "rotate: Replicate API token"

open_pr_and_merge "$BRANCH" \
    "rotate: Replicate API token" \
    "Rotates \`REPLICATE_API_TOKEN\`. Old token stays valid until this PR merges, production is promoted, services are redeployed, direct Replicate smoke passes, and the operator manually deletes the old token in the Replicate UI. Automated by \`rotate-genai-replicate.sh\`." \
    || exit 1

push_prod_and_watch "$DEPLOY_WORKFLOW" || {
    error "Deploy workflow failed. Old key NOT deleted — resolve manually."
    exit 1
}

#######################################
# 5. End-to-end smoke (optional)
#######################################
if [ -n "$POLLINATIONS_SK_TOKEN" ]; then
    section "End-to-end smoke via $GEN_PROD_URL"
    E2E_OUT=$(mktemp -t pln-seedance2-smoke.XXXXXX.mp4)
    E2E_HTTP=$(curl -s -o "$E2E_OUT" -w "%{http_code}" --max-time 180 \
        "$GEN_PROD_URL/image/seedance-2-rotation-smoke?model=seedance-2.0&width=1280&height=720&duration=4&audio=false" \
        -H "Authorization: Bearer $POLLINATIONS_SK_TOKEN")
    E2E_SIZE=$(stat -f%z "$E2E_OUT" 2>/dev/null || stat -c%s "$E2E_OUT")
    if [ "$E2E_HTTP" = "200" ] && [ "$E2E_SIZE" -gt 50000 ]; then
        log "E2E smoke OK (HTTP $E2E_HTTP, $E2E_SIZE bytes)"
    else
        warn "E2E smoke HTTP $E2E_HTTP, size $E2E_SIZE — investigate manually."
    fi
    rm -f "$E2E_OUT"
else
    warn "POLLINATIONS_SK_TOKEN not set — skipping end-to-end smoke."
fi

#######################################
# 6. Reminder: delete old token (manual)
#######################################
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout main

section "Replicate Key Rotation Complete (manual cleanup required)"
echo ""
log "New token: ${REPLICATE_NEW_TOKEN:0:10}... (deployed to dev/staging/prod)"
log "Old token: ${OLD_TOKEN:0:10}... (still valid until you delete it)"
echo ""
warn "MANUAL STEP — Replicate has no token-delete API. Visit:"
echo "  https://replicate.com/account/api-tokens"
echo "Delete the token whose prefix matches: ${OLD_TOKEN:0:10}..."
echo ""
log "SOPS + production gen worker now using the new token."
