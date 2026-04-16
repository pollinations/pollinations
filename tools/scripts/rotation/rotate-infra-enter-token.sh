#!/bin/bash
# Rotate PLN_ENTER_TOKEN — the token enter.pollinations.ai uses to authenticate
# requests to the EC2 backend services (image.pollinations.ai, text.pollinations.ai).
#
# Usage: ./rotate-infra-enter-token.sh [--execute] [NEW_TOKEN]
#
# Default: dry-run (verify prerequisites + preview, no mutation).
# Pass --execute to actually rotate.
#
# Trust boundary: Cloudflare Worker (enter) → EC2 (image/text services)
#
# This script:
# 1. Writes the new token into all SOPS-encrypted files
# 2. Updates GitHub secrets (PLN_ENTER_TOKEN, ENTER_TOKEN)
# 3. Updates Wrangler secrets (production, staging)
#
# After running, commit the SOPS file changes and deploy EC2 services
# to pick up the new token from the decrypted env.
#
# GPU instances use a separate token (PLN_GPU_TOKEN).
# Use ./rotate-infra-gpu-token.sh for that.
#
# Prerequisites:
# - sops configured and working
# - gh CLI authenticated
# - wrangler CLI authenticated

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"

DRY_RUN=true
ENTER_DIR="$REPO_ROOT/enter.pollinations.ai"
SOPS_FILES=(
    "$REPO_ROOT/enter.pollinations.ai/secrets/dev.vars.json"
    "$REPO_ROOT/enter.pollinations.ai/secrets/staging.vars.json"
    "$REPO_ROOT/enter.pollinations.ai/secrets/prod.vars.json"
    "$REPO_ROOT/image.pollinations.ai/secrets/env.json"
    "$REPO_ROOT/text.pollinations.ai/secrets/env.json"
)
FAILURES=()

# Parse flags
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

wrangler_cmd() {
    if [ -x "$REPO_ROOT/node_modules/.bin/wrangler" ]; then
        "$REPO_ROOT/node_modules/.bin/wrangler" "$@"
    else
        npx wrangler "$@"
    fi
}

check_sops_key() {
    local file=$1
    local key=$2
    local fname
    fname=$(basename "$(dirname "$(dirname "$file")")")/$(basename "$file")

    if [ ! -f "$file" ]; then
        error "Missing file: $fname"
        FAILURES+=("Missing file: $fname")
        return 1
    fi

    if sops -d "$file" | jq -e --arg key "$key" 'has($key)' >/dev/null; then
        log "SOPS contains $key in $fname"
    else
        error "Missing $key in $fname"
        FAILURES+=("Missing $key: $fname")
        return 1
    fi
}

run() {
    if $DRY_RUN; then
        log "[dry-run] $1"
    else
        eval "$2"
    fi
}

#######################################
# Pre-flight: verify prerequisites (always runs)
#######################################
section "Pre-flight: verifying PLN_ENTER_TOKEN prerequisites"

for f in "${SOPS_FILES[@]}"; do
    check_sops_key "$f" "PLN_ENTER_TOKEN"
done

if gh auth status >/dev/null 2>&1; then
    log "GitHub CLI authenticated"
else
    error "GitHub CLI not authenticated"
    FAILURES+=("GitHub CLI auth")
fi

if wrangler_cmd whoami >/dev/null 2>&1; then
    log "Wrangler authenticated"
else
    error "Wrangler not authenticated"
    FAILURES+=("Wrangler auth")
fi

if [ ${#FAILURES[@]} -gt 0 ]; then
    error "Pre-flight failed:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
    exit 1
fi
log "Pre-flight OK"
FAILURES=()

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
fi

# Get or generate token
if [ -n "$1" ]; then
    section "Using provided token"
    NEW_TOKEN="$1"
else
    section "Generating new PLN_ENTER_TOKEN"
    NEW_TOKEN=$(openssl rand -hex 32)
fi
log "Token: ${NEW_TOKEN:0:8}...${NEW_TOKEN: -4}"

#######################################
# 1. Update SOPS files
#######################################
section "Updating SOPS-encrypted files"

for f in "${SOPS_FILES[@]}"; do
    fname=$(basename "$(dirname "$(dirname "$f")")")/$(basename "$f")
    if [ ! -f "$f" ]; then
        warn "Skipping $fname — file not found"
        continue
    fi
    run "sops --set PLN_ENTER_TOKEN in $fname" \
        "sops --set '[\"PLN_ENTER_TOKEN\"] \"$NEW_TOKEN\"' '$f'"
    if [ $? -eq 0 ] || $DRY_RUN; then
        log "✅ $fname"
    else
        error "❌ $fname"
        FAILURES+=("SOPS: $fname")
    fi
done

#######################################
# 2. Update GitHub Secrets
#######################################
section "Updating GitHub Secrets"

run "gh secret set PLN_ENTER_TOKEN" \
    "echo '$NEW_TOKEN' | gh secret set PLN_ENTER_TOKEN --repo pollinations/pollinations"
if [ $? -eq 0 ] || $DRY_RUN; then log "✅ PLN_ENTER_TOKEN"; else error "❌ PLN_ENTER_TOKEN"; FAILURES+=("GitHub: PLN_ENTER_TOKEN"); fi

run "gh secret set ENTER_TOKEN" \
    "echo '$NEW_TOKEN' | gh secret set ENTER_TOKEN --repo pollinations/pollinations"
if [ $? -eq 0 ] || $DRY_RUN; then log "✅ ENTER_TOKEN"; else error "❌ ENTER_TOKEN"; FAILURES+=("GitHub: ENTER_TOKEN"); fi

#######################################
# 3. Update Wrangler Secrets
#######################################
section "Updating Wrangler Secrets (enter.pollinations.ai)"

run "wrangler secret put PLN_ENTER_TOKEN --env production" \
    "echo '$NEW_TOKEN' | wrangler_cmd secret put PLN_ENTER_TOKEN --env production --config '$ENTER_DIR/wrangler.toml'"
if [ $? -eq 0 ] || $DRY_RUN; then log "✅ production"; else error "❌ production"; FAILURES+=("Wrangler: production"); fi

run "wrangler secret put PLN_ENTER_TOKEN --env staging" \
    "echo '$NEW_TOKEN' | wrangler_cmd secret put PLN_ENTER_TOKEN --env staging --config '$ENTER_DIR/wrangler.toml'"
if [ $? -eq 0 ] || $DRY_RUN; then log "✅ staging"; else error "❌ staging"; FAILURES+=("Wrangler: staging"); fi

#######################################
# Summary
#######################################
section "PLN_ENTER_TOKEN Rotation Summary"

echo ""
log "Token: ${NEW_TOKEN:0:8}...${NEW_TOKEN: -4}"
echo ""

if [ ${#FAILURES[@]} -eq 0 ]; then
    log "✅ All updates completed successfully!"
    echo ""
    log "Next steps:"
    echo "  1. Commit the SOPS file changes"
    echo "  2. Deploy EC2 services (CI handles this on merge)"
else
    error "The following updates failed:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
    echo ""
    warn "Fix failures before proceeding."
fi
