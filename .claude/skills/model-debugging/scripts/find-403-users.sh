#!/bin/bash
# Find users with frequent 403 errors from Tinybird
# Usage: ./find-403-users.sh [hours] [min_errors]
# Example: ./find-403-users.sh 24 10

HOURS="${1:-24}"
MIN_ERRORS="${2:-10}"

source "$(dirname "$0")/tinybird-query.sh"

QUERY="SELECT ge.user_id, any(users.github_username) as github_username, count() as error_count
FROM generation_event_v2 ge
LEFT JOIN (SELECT id, github_username FROM d1_user WHERE synced_at = (SELECT max(synced_at) FROM d1_user)) users
  ON ge.user_id = users.id
WHERE ge.response_status = 403
  AND ge.start_time > now() - interval $HOURS hour
  AND ge.user_id != ''
  AND ge.user_id != 'undefined'
GROUP BY ge.user_id
HAVING error_count >= $MIN_ERRORS
ORDER BY error_count DESC"

run_tinybird_query "$QUERY"
