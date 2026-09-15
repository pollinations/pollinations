#!/bin/bash

TINYBIRD_CONFIG="$(dirname "${BASH_SOURCE[0]}")/../../../../enter.pollinations.ai/observability/.tinyb"
TINYBIRD_TOKEN=$(jq -r '.token' "$TINYBIRD_CONFIG" 2>/dev/null)

if [ -z "$TINYBIRD_TOKEN" ] || [ "$TINYBIRD_TOKEN" = "null" ]; then
    echo "Error: Could not read Tinybird token from $TINYBIRD_CONFIG" >&2
    exit 1
fi

run_tinybird_query() {
    curl -s "https://api.europe-west2.gcp.tinybird.co/v0/sql?token=$TINYBIRD_TOKEN" \
        --data-urlencode "q=$1"
}
