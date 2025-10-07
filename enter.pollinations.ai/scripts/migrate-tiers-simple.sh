#!/bin/bash
# Migrate user tiers from auth.pollinations.ai to enter.pollinations.ai
# Usage: AUTH_ADMIN_API_KEY=xxx ./scripts/migrate-tiers-simple.sh [--remote]

set -e

if [ -z "$AUTH_ADMIN_API_KEY" ]; then
  echo "❌ AUTH_ADMIN_API_KEY required"
  exit 1
fi

# Determine if remote or local
ENV_FLAG="--local"
if [ "$1" = "--remote" ]; then
  ENV_FLAG="--remote"
fi

echo "🔍 Fetching tiers from auth.pollinations.ai..."

# Fetch users and generate SQL
curl -s -H "Authorization: Bearer $AUTH_ADMIN_API_KEY" \
  https://auth.pollinations.ai/admin/users | \
  jq -r '.[] | select(.tier != "seed") | 
    "UPDATE user SET tier = \"" + .tier + "\" WHERE github_id = " + .github_user_id + ";"' \
  > /tmp/tier_updates.sql

COUNT=$(wc -l < /tmp/tier_updates.sql | tr -d ' ')

if [ "$COUNT" -eq 0 ]; then
  echo "✨ No tiers to migrate"
  exit 0
fi

echo "📊 Migrating $COUNT users..."
wrangler d1 execute DB $ENV_FLAG --file=/tmp/tier_updates.sql
echo "✅ Done!"
