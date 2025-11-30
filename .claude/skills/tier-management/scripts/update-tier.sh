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

# Find user
USER_INFO=$(npx wrangler d1 execute DB --remote --env production \
    --command "SELECT github_username, email, tier FROM user WHERE LOWER(github_username) LIKE '%${USER_QUERY}%' OR LOWER(email) LIKE '%${USER_QUERY}%';" 2>/dev/null | tail -n +8)

if [ -z "$USER_INFO" ] || echo "$USER_INFO" | grep -q "0 rows"; then
    error "User not found: $USER_QUERY"
fi

echo "$USER_INFO"
echo ""

# Extract username and email from output
USERNAME=$(echo "$USER_INFO" | grep "│" | head -1 | awk -F '│' '{print $2}' | tr -d ' ')
EMAIL=$(echo "$USER_INFO" | grep "│" | head -1 | awk -F '│' '{print $3}' | tr -d ' ')
CURRENT_TIER=$(echo "$USER_INFO" | grep "│" | head -1 | awk -F '│' '{print $4}' | tr -d ' ')

# Validate extracted username (prevent injection from malformed DB data)
if [[ ! "$USERNAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    error "Invalid username format from database"
fi

if [ -z "$USERNAME" ]; then
    error "Could not parse user info"
fi

log "Found: $USERNAME ($EMAIL) - current tier: $CURRENT_TIER"

if [ "$CURRENT_TIER" = "$TARGET_TIER" ]; then
    warn "User is already on $TARGET_TIER tier"
    exit 0
fi

# Update DB
log "Updating database tier..."
npx wrangler d1 execute DB --remote --env production \
    --command "UPDATE user SET tier='$TARGET_TIER' WHERE github_username='$USERNAME';" 2>/dev/null

# Update Polar (if email exists)
if [ -n "$EMAIL" ]; then
    log "Updating Polar subscription..."
    
    if [ -z "$POLAR_ACCESS_TOKEN" ]; then
        warn "POLAR_ACCESS_TOKEN not set. Getting from sops..."
        export POLAR_ACCESS_TOKEN=$(sops -d secrets/prod.vars.json 2>/dev/null | grep POLAR_ACCESS_TOKEN | cut -d'"' -f4)
    fi
    
    if [ -n "$POLAR_ACCESS_TOKEN" ]; then
        npx tsx scripts/manage-polar.ts user update-tier --email "$EMAIL" --tier "$TARGET_TIER" 2>/dev/null || warn "Polar update failed (user may not have subscription)"
    else
        warn "Could not get POLAR_ACCESS_TOKEN - skipping Polar update"
    fi
fi

# Verify
log "Verifying update..."
npx wrangler d1 execute DB --remote --env production \
    --command "SELECT github_username, tier FROM user WHERE github_username='$USERNAME';" 2>/dev/null | tail -n +8

echo ""
log "✅ Tier updated: $USERNAME → $TARGET_TIER"
