#!/bin/bash
# Find users with frequent 402 errors (billing/quota issues) from Tinybird
# Usage: ./find-402-users.sh [hours] [min_errors]
# Example: ./find-402-users.sh 24 10

HOURS="${1:-24}"
MIN_ERRORS="${2:-10}"

SCRIPT_DIR="$(dirname "$0")"
ENTER_DIR="$SCRIPT_DIR/../../../../enter.pollinations.ai"

# Get Tinybird admin token
TINYBIRD_TOKEN=$(jq -r '.token' "$ENTER_DIR/observability/.tinyb" 2>/dev/null)
if [ -z "$TINYBIRD_TOKEN" ] || [ "$TINYBIRD_TOKEN" = "null" ]; then
    echo "Error: Could not read Tinybird token from $ENTER_DIR/observability/.tinyb" >&2
    exit 1
fi

QUERY="SELECT user_github_username, count() as error_count
FROM generation_event 
WHERE response_status = 402 
  AND start_time > now() - interval $HOURS hour 
  AND user_github_username != '' 
  AND user_github_username != 'undefined'
GROUP BY user_github_username
HAVING error_count >= $MIN_ERRORS
ORDER BY error_count DESC"

# Execute query
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/sql?token=$TINYBIRD_TOKEN" \
    --data-urlencode "q=$QUERY"
