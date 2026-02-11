#!/bin/bash
# Rotate PLN_ENTER_TOKEN across enter.pollinations.ai and related services
# Usage: ./rotate-enter-token.sh [NEW_TOKEN]
#
# If NEW_TOKEN is provided as argument, use that instead of reading from secrets.
#
# This script updates the token in:
# 1. GitHub secrets (PLN_ENTER_TOKEN, ENTER_TOKEN)
# 2. Wrangler secrets (production, staging)
#
# NOTE: io.net backend instances now use PLN_IMAGE_BACKEND_TOKEN instead.
# Use ./rotate-backend-token.sh for backend token rotation.
#
# Prerequisites:
# - sops configured and working (unless token passed as argument)
# - gh CLI authenticated
# - wrangler CLI authenticated

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
section() { echo -e "\n${BLUE}=== $1 ===${NC}"; }

# Get the new token - either from argument or from encrypted secrets
if [ -n "$1" ]; then
    section "Using provided token"
    NEW_TOKEN="$1"
    log "Token provided as argument: ${NEW_TOKEN:0:8}...${NEW_TOKEN: -4}"
else
    section "Reading new PLN_ENTER_TOKEN from secrets"
    NEW_TOKEN=$(sops -d "$REPO_ROOT/image.pollinations.ai/secrets/env.json" 2>/dev/null | grep '"PLN_ENTER_TOKEN"' | cut -d'"' -f4)
    
    if [ -z "$NEW_TOKEN" ]; then
        error "Failed to read PLN_ENTER_TOKEN from secrets. Make sure sops is configured."
        error "Or pass the token as an argument: ./rotate-enter-token.sh <TOKEN>"
        exit 1
    fi
    
    log "Token from secrets: ${NEW_TOKEN:0:8}...${NEW_TOKEN: -4}"
fi

# Track failures
FAILURES=()

#######################################
# 1. Update GitHub Secrets
#######################################
section "Updating GitHub Secrets"

log "Setting PLN_ENTER_TOKEN..."
if echo "$NEW_TOKEN" | gh secret set PLN_ENTER_TOKEN --repo pollinations/pollinations 2>/dev/null; then
    log "✅ PLN_ENTER_TOKEN updated"
else
    error "❌ Failed to update PLN_ENTER_TOKEN"
    FAILURES+=("GitHub: PLN_ENTER_TOKEN")
fi

log "Setting ENTER_TOKEN..."
if echo "$NEW_TOKEN" | gh secret set ENTER_TOKEN --repo pollinations/pollinations 2>/dev/null; then
    log "✅ ENTER_TOKEN updated"
else
    error "❌ Failed to update ENTER_TOKEN"
    FAILURES+=("GitHub: ENTER_TOKEN")
fi

#######################################
# 2. Update Wrangler Secrets
#######################################
section "Updating Wrangler Secrets (enter.pollinations.ai)"

cd "$REPO_ROOT/enter.pollinations.ai"

log "Setting PLN_ENTER_TOKEN for production..."
if echo "$NEW_TOKEN" | npx wrangler secret put PLN_ENTER_TOKEN --env production 2>/dev/null; then
    log "✅ Production secret updated"
else
    error "❌ Failed to update production secret"
    FAILURES+=("Wrangler: production")
fi

log "Setting PLN_ENTER_TOKEN for staging..."
if echo "$NEW_TOKEN" | npx wrangler secret put PLN_ENTER_TOKEN --env staging 2>/dev/null; then
    log "✅ Staging secret updated"
else
    error "❌ Failed to update staging secret"
    FAILURES+=("Wrangler: staging")
fi

cd "$REPO_ROOT"

#######################################
# Summary
#######################################
section "Token Rotation Summary"

echo ""
log "New token: ${NEW_TOKEN:0:8}...${NEW_TOKEN: -4}"
echo ""

if [ ${#FAILURES[@]} -eq 0 ]; then
    log "✅ All updates completed successfully!"
else
    error "The following updates failed:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
    echo ""
    warn "Please manually update the failed components."
fi

echo ""
log "Reminder: The following need manual updates (commit required):"
echo "  - enter.pollinations.ai/secrets/*.vars.json (use: sops --set '[\"PLN_ENTER_TOKEN\"] \"NEW_TOKEN\"' <file>)"
echo "  - image.pollinations.ai/secrets/env.json (sops)"
echo "  - text.pollinations.ai/secrets/env.json (sops)"
echo "  - enter.pollinations.ai/.dev.vars"
echo "  - enter.pollinations.ai/.testingtokens"
echo ""
log "After committing, trigger EC2 deploy to update enter-services (CI handles this)."
echo ""
log "NOTE: io.net backend instances use PLN_IMAGE_BACKEND_TOKEN instead."
log "Use ./rotate-backend-token.sh for backend token rotation."
