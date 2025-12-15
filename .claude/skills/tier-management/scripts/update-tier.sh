#!/bin/bash
# Update a user's tier in both DB and Polar
# Usage: ./update-tier.sh <username_or_email> <tier>
# Example: ./update-tier.sh ez-vivek flower

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Parse args
USER_QUERY="${1:-}"
TARGET_TIER="${2:-}"

if [ -z "$USER_QUERY" ] || [ -z "$TARGET_TIER" ]; then
    echo "Usage: $0 <username_or_email> <tier>"
    echo "       tier: spore, seed, flower, nectar, router"
    echo ""
    echo "Example: $0 ez-vivek flower"
    exit 1
fi

# Validate tier
case "$TARGET_TIER" in
    spore|seed|flower|nectar|router) ;;
    *) error "Invalid tier: $TARGET_TIER (must be: spore, seed, flower, nectar, router)" ;;
esac

# Sanitize USER_QUERY to prevent SQL injection
# Only allow: alphanumeric, @, ., -, _
if [[ ! "$USER_QUERY" =~ ^[a-zA-Z0-9@._-]+$ ]]; then
    error "Invalid characters in query. Only alphanumeric, @, ., -, _ allowed."
fi

# Must be run from enter.pollinations.ai
ENTER_DIR="$(dirname "$0")/../../../../enter.pollinations.ai"
if [ ! -d "$ENTER_DIR" ]; then
    error "Could not find enter.pollinations.ai directory. Run from pollinations repo root."
fi
cd "$ENTER_DIR"

log "Looking up user: $USER_QUERY"

# Find user (wrangler outputs JSON)
USER_JSON=$(npx wrangler d1 execute DB --remote --env production --json \
    --command "SELECT github_username, email, tier FROM user WHERE LOWER(github_username) LIKE '%${USER_QUERY}%' OR LOWER(email) LIKE '%${USER_QUERY}%' LIMIT 1;" 2>/dev/null)

# Parse JSON with jq
USERNAME=$(echo "$USER_JSON" | jq -r '.[0].results[0].github_username // empty')
EMAIL=$(echo "$USER_JSON" | jq -r '.[0].results[0].email // empty')
CURRENT_TIER=$(echo "$USER_JSON" | jq -r '.[0].results[0].tier // empty')

if [ -z "$USERNAME" ]; then
    error "User not found: $USER_QUERY"
fi

# Validate extracted username (prevent injection from malformed DB data)
if [[ ! "$USERNAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    error "Invalid username format from database"
fi

log "Found: $USERNAME ($EMAIL) - current DB tier: $CURRENT_TIER"

# Update DB (if needed)
if [ "$CURRENT_TIER" = "$TARGET_TIER" ]; then
    log "DB tier already at $TARGET_TIER"
else
    log "Updating database tier..."
    npx wrangler d1 execute DB --remote --env production \
        --command "UPDATE user SET tier='$TARGET_TIER' WHERE github_username='$USERNAME';" 2>/dev/null
    log "✅ DB updated: $CURRENT_TIER → $TARGET_TIER"
fi

# Always check/update Polar (even if DB matches)
if [ -n "$EMAIL" ]; then
    log "Checking Polar subscription..."
    
    if [ -z "$POLAR_ACCESS_TOKEN" ]; then
        export POLAR_ACCESS_TOKEN=$(sops -d secrets/prod.vars.json 2>/dev/null | grep POLAR_ACCESS_TOKEN | cut -d'"' -f4)
    fi
    
    if [ -n "$POLAR_ACCESS_TOKEN" ]; then
        npx tsx scripts/manage-polar.ts user update-tier --email "$EMAIL" --tier "$TARGET_TIER" --apply 2>/dev/null || warn "Polar update skipped (user may not have subscription)"
    else
        warn "Could not get POLAR_ACCESS_TOKEN - skipping Polar update"
    fi
else
    warn "No email found - skipping Polar update"
fi

# Verify
log "Verifying update..."
VERIFY_JSON=$(npx wrangler d1 execute DB --remote --env production --json \
    --command "SELECT github_username, tier FROM user WHERE github_username='$USERNAME';" 2>/dev/null)
VERIFIED_TIER=$(echo "$VERIFY_JSON" | jq -r '.[0].results[0].tier // empty')

if [ "$VERIFIED_TIER" = "$TARGET_TIER" ]; then
    log "✅ Tier updated: $USERNAME → $TARGET_TIER"
else
    error "Verification failed: expected $TARGET_TIER but got $VERIFIED_TIER"
fi
