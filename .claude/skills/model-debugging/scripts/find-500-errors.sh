#!/bin/bash
# Find users/models with 500 errors (actual backend issues)
# Usage: ./find-500-errors.sh [hours]
# Example: ./find-500-errors.sh 24

HOURS="${1:-24}"

source "$(dirname "$0")/tinybird-query.sh"

QUERY="SELECT ge.user_id, any(users.github_username) as github_username, ge.model_requested, ge.error_message, count() as error_count
FROM generation_event_v2 ge
LEFT JOIN (SELECT id, github_username FROM d1_user WHERE synced_at = (SELECT max(synced_at) FROM d1_user)) users
  ON ge.user_id = users.id
WHERE ge.response_status >= 500
  AND ge.start_time > now() - interval $HOURS hour
GROUP BY ge.user_id, ge.model_requested, ge.error_message
ORDER BY error_count DESC
LIMIT 50"

echo "=== 500+ Errors (Last ${HOURS}h) ==="
run_tinybird_query "$QUERY"
