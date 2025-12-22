#!/bin/bash
# Find users with frequent 403 errors from Tinybird
# Usage: ./find-403-users.sh [hours] [min_errors] [tier_filter]
# Example: ./find-403-users.sh 24 10 spore

HOURS="${1:-24}"
MIN_ERRORS="${2:-10}"
TIER_FILTER="${3:-}"  # Optional: spore, seed, flower, etc.

SCRIPT_DIR="$(dirname "$0")"
ENTER_DIR="$SCRIPT_DIR/../../../../enter.pollinations.ai"

# Get Tinybird admin token
TINYBIRD_TOKEN=$(jq -r '.token' "$ENTER_DIR/observability/.tinyb" 2>/dev/null)
if [ -z "$TINYBIRD_TOKEN" ] || [ "$TINYBIRD_TOKEN" = "null" ]; then
    echo "Error: Could not read Tinybird token from $ENTER_DIR/observability/.tinyb" >&2
    exit 1
fi

# Build query
TIER_CLAUSE=""
if [ -n "$TIER_FILTER" ]; then
    TIER_CLAUSE="AND user_tier = '$TIER_FILTER'"
fi

QUERY="SELECT user_github_username, user_tier, count() as error_count 
FROM generation_event 
WHERE response_status = 403 
  AND start_time > now() - interval $HOURS hour 
  AND user_github_username != '' 
  AND user_github_username != 'undefined'
  $TIER_CLAUSE
GROUP BY user_github_username, user_tier 
HAVING error_count >= $MIN_ERRORS
ORDER BY error_count DESC"

# Execute query
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/sql?token=$TINYBIRD_TOKEN" \
    --data-urlencode "q=$QUERY"
