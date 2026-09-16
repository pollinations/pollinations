#!/usr/bin/env bash
# Run a SQL query against the PRODUCTION Tinybird workspace (pollinations_enter)
# using the read token from SOPS. Ignores whatever .tinyb currently points at,
# which has pointed at staging before. No row cap (HTTP API, not the tb CLI).
#
#   observability/scripts/tb-prod.sh "SELECT count() FROM generation_event_v2 WHERE start_time > now() - interval 1 hour FORMAT JSON"
#   observability/scripts/tb-prod.sh --check     # token works and events are fresh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
secrets="$here/../../secrets/prod.vars.json"
host="https://api.europe-west2.gcp.tinybird.co"

token=$(sops -d "$secrets" | jq -r '.TINYBIRD_READ_TOKEN')
if [ -z "$token" ] || [ "$token" = "null" ]; then
    echo "TINYBIRD_READ_TOKEN missing in $secrets" >&2
    exit 1
fi

if [ "${1:-}" = "--check" ]; then
    query="SELECT count() AS events_last_10m, max(start_time) AS latest FROM generation_event_v2 WHERE start_time > now() - interval 10 minute FORMAT JSON"
else
    query="${1:?usage: tb-prod.sh \"<sql>\" | --check}"
fi

curl -sS "$host/v0/sql" -H "Authorization: Bearer $token" --data-urlencode "q=$query"
echo
