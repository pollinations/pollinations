#!/bin/bash
# Rotate PLN_ENTER_TOKEN — the token enter.pollinations.ai uses to authenticate
# requests to the EC2 backend services (image.pollinations.ai, text.pollinations.ai).
#
# Usage: ./rotate-infra-enter-token.sh [--execute] [NEW_TOKEN]
#
# Default: dry-run. Pass --execute for the full end-to-end cycle.
#
# Trust boundary: Cloudflare Worker (enter) → EC2 (image/text services)
#
# Order matters: update SOPS first (so EC2 picks up the new token via
# deploy-enter-services.yml), then update Wrangler secrets (so enter worker
# starts sending the new token) — minimizes the rejection window between
# EC2-has-new and worker-still-old.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"

DRY_RUN=true
PROVIDED_TOKEN=""
while [ $# -gt 0 ]; do
    case "$1" in
        --execute) DRY_RUN=false; shift ;;
        --*) echo "Unknown flag: $1"; exit 1 ;;
        *)
            if [ -n "$PROVIDED_TOKEN" ]; then
                echo "Multiple positional args: '$PROVIDED_TOKEN' and '$1'"
                exit 1
            fi
            PROVIDED_TOKEN="$1"
            shift
            ;;
    esac
done

if [ -n "$PROVIDED_TOKEN" ] && ! [[ "$PROVIDED_TOKEN" =~ ^[A-Za-z0-9_-]{16,128}$ ]]; then
    echo "PROVIDED_TOKEN must be 16-128 chars of [A-Za-z0-9_-] (got ${#PROVIDED_TOKEN} chars)."
    exit 1
fi

source "$SCRIPT_DIR/_log.sh"
source "$SCRIPT_DIR/_pr-deploy.sh"

wrangler_cmd() {
    if [ -x "$REPO_ROOT/node_modules/.bin/wrangler" ]; then
        "$REPO_ROOT/node_modules/.bin/wrangler" "$@"
    else
        npx wrangler "$@"
    fi
}

REPO="pollinations/pollinations"
ENTER_DIR="$REPO_ROOT/enter.pollinations.ai"
SOPS_FILES=(
    "$ENTER_DIR/secrets/dev.vars.json"
    "$ENTER_DIR/secrets/staging.vars.json"
    "$ENTER_DIR/secrets/prod.vars.json"
    "$REPO_ROOT/image.pollinations.ai/secrets/env.json"
    "$REPO_ROOT/text.pollinations.ai/secrets/env.json"
)
DEPLOY_WORKFLOW="deploy-enter-services.yml"
GEN_BASE="https://gen.pollinations.ai"
TESTING_TOKENS_FILE="$REPO_ROOT/enter.pollinations.ai/.testingtokens"
# Token rotation impacts BOTH text and image services — verify both end-to-end
HEALTH_TEXT_MODEL="openai-fast"
HEALTH_TEXT_EXPECT="gpt-5"
HEALTH_IMAGE_MODEL="zimage"

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

for f in "${SOPS_FILES[@]}"; do
    fname=$(basename "$(dirname "$(dirname "$f")")")/$(basename "$f")
    if [ ! -f "$f" ]; then
        error "SOPS file missing: $fname"
        exit 1
    fi
    if ! sops -d "$f" | jq -e 'has("PLN_ENTER_TOKEN")' >/dev/null; then
        error "PLN_ENTER_TOKEN missing from $fname"
        exit 1
    fi
done
log "SOPS: 5 files contain PLN_ENTER_TOKEN"

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
    echo "  1. Generate new PLN_ENTER_TOKEN (openssl rand -hex 32)"
    echo "  2. Update SOPS (5 files)"
    echo "  3. Update GitHub secrets (PLN_ENTER_TOKEN, ENTER_TOKEN)"
    echo "  4. Open PR: rotate/enter-token-<date> → main, auto-merge"
    echo "  5. Push main → production (admin)"
    echo "  6. Watch $DEPLOY_WORKFLOW (EC2 picks up new token)"
    echo "  7. Wrangler secret put (worker switches to new token — minimises rejection window)"
    echo "  8. Health check: text ($HEALTH_TEXT_MODEL) + image ($HEALTH_IMAGE_MODEL) via $GEN_BASE"
    exit 0
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

#######################################
# 1. Generate or use provided token
#######################################
if [ -n "$PROVIDED_TOKEN" ]; then
    section "Using provided token"
    NEW_TOKEN="$PROVIDED_TOKEN"
else
    section "Generating new PLN_ENTER_TOKEN"
    NEW_TOKEN=$(openssl rand -hex 32)
fi
log "Token: ${NEW_TOKEN:0:4}...${NEW_TOKEN: -4}"

#######################################
# 2. Update SOPS
#######################################
section "Updating SOPS-encrypted files"

for f in "${SOPS_FILES[@]}"; do
    fname=$(basename "$(dirname "$(dirname "$f")")")/$(basename "$f")
    sops --set "[\"PLN_ENTER_TOKEN\"] $(printf '%s' "$NEW_TOKEN" | jq -Rs .)" "$f"
    log "  $fname updated"
done

#######################################
# 3. Update GitHub Secrets
#######################################
section "Updating GitHub Secrets"

echo "$NEW_TOKEN" | gh secret set PLN_ENTER_TOKEN --repo "$REPO"
log "  gh secret: PLN_ENTER_TOKEN"
echo "$NEW_TOKEN" | gh secret set ENTER_TOKEN --repo "$REPO"
log "  gh secret: ENTER_TOKEN"

#######################################
# 4. PR + deploy (EC2 picks up new token)
#######################################
section "Opening PR and deploying"

BRANCH="rotate/enter-token-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "${SOPS_FILES[@]}"
git commit -m "rotate: PLN_ENTER_TOKEN"

open_pr_and_merge "$BRANCH" \
    "rotate: PLN_ENTER_TOKEN" \
    "Rotates \`PLN_ENTER_TOKEN\` (CF Worker → EC2 trust boundary). Updates 5 SOPS files and GitHub secrets. After merge, main→production triggers EC2 deploy; the script then updates the Wrangler secret so the worker switches to the new token. Automated by \`rotate-infra-enter-token.sh\`." \
    || exit 1

push_prod_and_watch "$DEPLOY_WORKFLOW" || {
    error "Deploy workflow failed. Worker still has OLD token — EC2 now has NEW. Production is in a broken state; revert the SOPS commit and redeploy, or manually update Wrangler to align."
    exit 1
}

#######################################
# 8. Wrangler secret put (close the rejection window)
#######################################
section "Updating Wrangler secret (worker switches to new token)"

for env in production staging; do
    echo "$NEW_TOKEN" | wrangler_cmd secret put PLN_ENTER_TOKEN --env "$env" --config "$ENTER_DIR/wrangler.toml"
    log "  wrangler: $env"
done

#######################################
# 9. Health check (text + image; verifies worker→EC2 token alignment)
#######################################
section "Health check (text: $HEALTH_TEXT_MODEL)"

HC_BODY=$(curl -sS --max-time 60 \
    -X POST "$GEN_BASE/v1/chat/completions" \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$HEALTH_TEXT_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"reply ok\"}],\"max_tokens\":10}")
HC_ERR=$(echo "$HC_BODY" | jq -r '.error.message // ""')
if [ -n "$HC_ERR" ]; then
    error "Text health check failed: $HC_ERR"
    error "Body: $HC_BODY"
    exit 1
fi
HC_MODEL=$(echo "$HC_BODY" | jq -r '.model // ""')
if ! echo "$HC_MODEL" | grep -qiE "$HEALTH_TEXT_EXPECT"; then
    error "Text routing mismatch: model='$HC_MODEL' (expected '$HEALTH_TEXT_EXPECT')"
    exit 1
fi
log "Text OK: model='$HC_MODEL'"

section "Health check (image: $HEALTH_IMAGE_MODEL)"

HC_TMP=$(mktemp)
trap 'rm -f "$HC_TMP"' EXIT
HC_META=$(curl -sS --max-time 90 -o "$HC_TMP" \
    -w "%{http_code}|%{content_type}|%{size_download}" \
    "$GEN_BASE/image/healthcheck%20cat?model=$HEALTH_IMAGE_MODEL&width=512&height=512&nologo=true&seed=$(date +%s)" \
    -H "Authorization: Bearer $TEST_TOKEN")
HC_CODE="${HC_META%%|*}"
HC_REST="${HC_META#*|}"
HC_CT="${HC_REST%%|*}"
HC_SIZE="${HC_REST#*|}"
if [ "$HC_CODE" != "200" ] || ! echo "$HC_CT" | grep -q "^image/"; then
    error "Image health check failed: HTTP $HC_CODE content-type=$HC_CT"
    error "Body preview: $(head -c 500 "$HC_TMP")"
    exit 1
fi
log "Image OK: $HC_CT, $HC_SIZE bytes"
rm -f "$HC_TMP"; trap - EXIT

#######################################
# Restore original branch
#######################################
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout main

section "PLN_ENTER_TOKEN Rotation Complete"
echo ""
log "New token: ${NEW_TOKEN:0:4}...${NEW_TOKEN: -4}"
echo ""
log "SOPS + GitHub + production + EC2 + Wrangler now aligned on the new token."
