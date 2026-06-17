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

# Sanitize input to prevent SQL injection
if [[ ! "$USER_QUERY" =~ ^[a-zA-Z0-9@._-]+$ ]]; then
    echo "Invalid characters in query. Only alphanumeric, @, ., -, _ allowed."
    exit 1
fi

cd "$ENTER_DIR"

# Find user in DB
USER_JSON=$(npx wrangler d1 execute DB --remote --env production --json \
    --command "SELECT id, github_username, email, tier, tier_balance, created_at FROM user WHERE LOWER(github_username) LIKE '%${USER_QUERY}%' OR LOWER(email) LIKE '%${USER_QUERY}%' LIMIT 1;" 2>/dev/null)

USER_ID=$(echo "$USER_JSON" | jq -r '.[0].results[0].id // empty')
USERNAME=$(echo "$USER_JSON" | jq -r '.[0].results[0].github_username // empty')
EMAIL=$(echo "$USER_JSON" | jq -r '.[0].results[0].email // empty')
TIER=$(echo "$USER_JSON" | jq -r '.[0].results[0].tier // empty')
BALANCE=$(echo "$USER_JSON" | jq -r '.[0].results[0].tier_balance // empty')
CREATED=$(echo "$USER_JSON" | jq -r '.[0].results[0].created_at // empty')

if [ -z "$USER_ID" ]; then
    echo "User not found: $USER_QUERY"
    exit 1
fi

echo "=== User Info ==="
echo "ID:       $USER_ID"
echo "Username: $USERNAME"
echo "Email:    $EMAIL"
echo "Tier:     $TIER"
echo "Balance:  $BALANCE pollen"
echo "Created:  $CREATED"
echo ""
