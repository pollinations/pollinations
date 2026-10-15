#!/bin/bash
# Find users/models with 500 errors (actual backend issues)
# Usage: ./find-500-errors.sh [hours]
# Example: ./find-500-errors.sh 24
set -euo pipefail

HOURS="${1:-24}"

source "$(dirname "$0")/tinybird-query.sh"
validate_positive_integer "$HOURS" 720 hours

QUERY="SELECT user_id, argMax(user_github_username, start_time) AS github_username, model_requested, response_status, error_source, error_response_code, argMax(error_message, start_time) AS sample_error, count() AS error_count
FROM generation_event_v2
WHERE is_final
  AND response_status >= 500
  AND start_time > now() - interval $HOURS hour
GROUP BY user_id, model_requested, response_status, error_source, error_response_code
ORDER BY error_count DESC
LIMIT 50 FORMAT JSON"

echo "=== 500+ Errors (Last ${HOURS}h) ==="
run_tinybird_query "$QUERY"
