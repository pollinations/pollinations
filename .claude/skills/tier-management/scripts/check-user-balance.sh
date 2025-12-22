#!/bin/bash
# Check a user's pollen balance and tier info
# Usage: ./check-user-balance.sh <username_or_email>

USER_QUERY="${1:-}"
if [ -z "$USER_QUERY" ]; then
    echo "Usage: $0 <username_or_email>"
    exit 1
fi

SCRIPT_DIR="$(dirname "$0")"
ENTER_DIR="$SCRIPT_DIR/../../../../enter.pollinations.ai"
cd "$ENTER_DIR"

# Find user in DB
USER_JSON=$(npx wrangler d1 execute DB --remote --env production --json \
    --command "SELECT id, github_username, email, tier FROM user WHERE LOWER(github_username) LIKE '%${USER_QUERY}%' OR LOWER(email) LIKE '%${USER_QUERY}%' LIMIT 1;" 2>/dev/null)

USER_ID=$(echo "$USER_JSON" | jq -r '.[0].results[0].id // empty')
USERNAME=$(echo "$USER_JSON" | jq -r '.[0].results[0].github_username // empty')
EMAIL=$(echo "$USER_JSON" | jq -r '.[0].results[0].email // empty')
TIER=$(echo "$USER_JSON" | jq -r '.[0].results[0].tier // empty')

if [ -z "$USER_ID" ]; then
    echo "User not found: $USER_QUERY"
    exit 1
fi

echo "=== User Info ==="
echo "ID:       $USER_ID"
echo "Username: $USERNAME"
echo "Email:    $EMAIL"
echo "DB Tier:  $TIER"
echo ""

# Check Polar balance
if [ -z "$POLAR_ACCESS_TOKEN" ]; then
    export POLAR_ACCESS_TOKEN=$(sops -d secrets/prod.vars.json 2>/dev/null | jq -r '.POLAR_ACCESS_TOKEN')
fi

if [ -n "$POLAR_ACCESS_TOKEN" ] && [ "$POLAR_ACCESS_TOKEN" != "null" ]; then
    echo "=== Polar Balance ==="
    npx tsx scripts/manage-polar.ts customer list-meters --email "$EMAIL" --env production 2>/dev/null | \
        grep -E "(balance|consumedUnits|creditedUnits|meter.*name)" | head -20
else
    echo "Could not get POLAR_ACCESS_TOKEN - skipping balance check"
fi
