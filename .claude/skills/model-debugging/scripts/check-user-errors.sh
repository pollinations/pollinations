#!/bin/bash
# Check a specific user's recent errors
# Usage: ./check-user-errors.sh <user_id> [hours]

USER_ID="${1:-}"
HOURS="${2:-24}"

if [ -z "$USER_ID" ]; then
    echo "Usage: $0 <user_id> [hours]"
    exit 1
fi
if [[ ! "$USER_ID" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "Error: Invalid user_id" >&2
    exit 1
fi

SCRIPT_DIR="$(dirname "$0")"
ENTER_DIR="$SCRIPT_DIR/../../../../enter.pollinations.ai"

# Get Tinybird admin token
TINYBIRD_TOKEN=$(jq -r '.token' "$ENTER_DIR/observability/.tinyb" 2>/dev/null)
if [ -z "$TINYBIRD_TOKEN" ] || [ "$TINYBIRD_TOKEN" = "null" ]; then
    echo "Error: Could not read Tinybird token" >&2
    exit 1
fi

QUERY="SELECT start_time, response_status, model_requested, error_message
FROM generation_event
WHERE user_id = '$USER_ID'
  AND start_time > now() - interval $HOURS hour
ORDER BY start_time DESC
LIMIT 50"

echo "=== Errors for $USER_ID (Last ${HOURS}h) ==="
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/sql?token=$TINYBIRD_TOKEN" \
    --data-urlencode "q=$QUERY"
