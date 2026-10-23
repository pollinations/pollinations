#!/bin/bash
# Find users with frequent 402 errors (billing/quota issues) from Tinybird
# Usage: ./find-402-users.sh [hours] [min_errors]
# Example: ./find-402-users.sh 24 10
set -euo pipefail

HOURS="${1:-24}"
MIN_ERRORS="${2:-10}"

source "$(dirname "$0")/tinybird-query.sh"
validate_positive_integer "$HOURS" 720 hours
validate_positive_integer "$MIN_ERRORS" 100000 min_errors

QUERY="SELECT user_id, argMax(user_github_username, start_time) AS github_username, count() AS error_count
FROM generation_event_v2
WHERE is_final
  AND response_status = 402
  AND start_time > now() - interval $HOURS hour
  AND user_id NOT IN ('', 'undefined')
GROUP BY user_id
HAVING error_count >= $MIN_ERRORS
ORDER BY error_count DESC
LIMIT 50 FORMAT JSON"

run_tinybird_query "$QUERY"
