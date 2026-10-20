#!/bin/bash
# Check a specific user's recent errors
# Usage: ./check-user-errors.sh <user_id> [hours]
set -euo pipefail

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

source "$(dirname "$0")/tinybird-query.sh"
validate_positive_integer "$HOURS" 720 hours

QUERY="SELECT start_time, response_status, model_requested, error_source, error_response_code, error_message
FROM generation_event_v2
WHERE user_id = '$USER_ID'
  AND is_final
  AND response_status >= 400
  AND start_time > now() - interval $HOURS hour
ORDER BY start_time DESC
LIMIT 50 FORMAT JSON"

echo "=== Errors for $USER_ID (Last ${HOURS}h) ==="
run_tinybird_query "$QUERY"
