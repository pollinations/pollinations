#!/bin/bash
# Find users/models with 500 errors (actual backend issues)
# Usage: ./find-500-errors.sh [hours]
# Example: ./find-500-errors.sh 24

HOURS="${1:-24}"

SCRIPT_DIR="$(dirname "$0")"
ENTER_DIR="$SCRIPT_DIR/../../../enter.pollinations.ai"

# Get Tinybird admin token
TINYBIRD_TOKEN=$(jq -r '.token' "$ENTER_DIR/observability/.tinyb" 2>/dev/null)
if [ -z "$TINYBIRD_TOKEN" ] || [ "$TINYBIRD_TOKEN" = "null" ]; then
    echo "Error: Could not read Tinybird token from $ENTER_DIR/observability/.tinyb" >&2
    exit 1
fi

QUERY="SELECT user_github_username, model_requested, error_message, count() as error_count 
FROM generation_event 
WHERE response_status >= 500 
  AND start_time > now() - interval $HOURS hour 
GROUP BY user_github_username, model_requested, error_message 
ORDER BY error_count DESC 
LIMIT 50"

echo "=== 500+ Errors (Last ${HOURS}h) ==="
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/sql?token=$TINYBIRD_TOKEN" \
    --data-urlencode "q=$QUERY"
