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
while [[ "$1" == --* ]]; do
    case "$1" in
        --execute) DRY_RUN=false; shift ;;
        *) echo "Unknown flag: $1"; exit 1 ;;
    esac
done
if [ -n "$1" ]; then
    PROVIDED_TOKEN="$1"
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
section() { echo -e "\n${BLUE}=== $1 ===${NC}"; }

wrangler_cmd() {
    if [ -x "$REPO_ROOT/node_modules/.bin/wrangler" ]; then
        "$REPO_ROOT/node_modules/.bin/wrangler" "$@"
    else
        npx wrangler "$@"
    fi
}

ENTER_DIR="$REPO_ROOT/enter.pollinations.ai"
SOPS_FILES=(
    "$ENTER_DIR/secrets/dev.vars.json"
    "$ENTER_DIR/secrets/staging.vars.json"
    "$ENTER_DIR/secrets/prod.vars.json"
    "$REPO_ROOT/image.pollinations.ai/secrets/env.json"
    "$REPO_ROOT/text.pollinations.ai/secrets/env.json"
)
DEPLOY_WORKFLOW="deploy-enter-services.yml"
HEALTH_URL="https://gen.pollinations.ai/v1/models"

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
    echo "  8. Health check $HEALTH_URL"
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
log "Token: ${NEW_TOKEN:0:8}...${NEW_TOKEN: -4}"

#######################################
# 2. Update SOPS
#######################################
section "Updating SOPS-encrypted files"

for f in "${SOPS_FILES[@]}"; do
    fname=$(basename "$(dirname "$(dirname "$f")")")/$(basename "$f")
    sops --set "[\"PLN_ENTER_TOKEN\"] \"$NEW_TOKEN\"" "$f"
    log "  $fname updated"
done

#######################################
# 3. Update GitHub Secrets
#######################################
section "Updating GitHub Secrets"

echo "$NEW_TOKEN" | gh secret set PLN_ENTER_TOKEN --repo pollinations/pollinations
log "  gh secret: PLN_ENTER_TOKEN"
echo "$NEW_TOKEN" | gh secret set ENTER_TOKEN --repo pollinations/pollinations
log "  gh secret: ENTER_TOKEN"

#######################################
# 4. Open PR to main, auto-merge
#######################################
section "Opening PR to main"

BRANCH="rotate/enter-token-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "${SOPS_FILES[@]}"
git commit -m "rotate: PLN_ENTER_TOKEN"
git push -u origin "$BRANCH"

gh pr create \
    --base main \
    --head "$BRANCH" \
    --title "rotate: PLN_ENTER_TOKEN" \
    --body "Rotates \`PLN_ENTER_TOKEN\` (CF Worker → EC2 trust boundary). Updates 5 SOPS files and GitHub secrets. After merge, main→production triggers EC2 deploy; the script then updates the Wrangler secret so the worker switches to the new token. Automated by \`rotate-infra-enter-token.sh\`."

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
# 7. Watch deploy-enter-services (EC2 picks up new token)
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
# 9. Health check
#######################################
section "Health check"

STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 30 "$HEALTH_URL")
if [ "$STATUS" != "200" ]; then
    error "Health check failed (HTTP $STATUS)."
    exit 1
fi
log "Production healthy (HTTP 200)."

#######################################
# Restore original branch
#######################################
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout main

section "PLN_ENTER_TOKEN Rotation Complete"
echo ""
log "New token: ${NEW_TOKEN:0:8}...${NEW_TOKEN: -4}"
echo ""
log "SOPS + GitHub + production + EC2 + Wrangler now aligned on the new token."
