#!/bin/bash
# Top up OpenClaw users to 20 pack balance every 120s
# Usage: bash apps/openclaw/auto-upgrade-openclaw-users.sh

DIR="$(cd "$(dirname "$0")/../../enter.pollinations.ai" && pwd)"
KNOWN_FILE=$(mktemp)

query() {
    cd "$DIR" && npx wrangler d1 execute DB --remote --env production --json --command "$1" 2>/dev/null
}

while true; do
    TS="[$(date +%H:%M:%S)]"

    JSON=$(query "SELECT u.github_username FROM user u JOIN apikey ak ON ak.user_id = u.id WHERE ak.name = 'openclaw.pollinations.ai' GROUP BY u.id ORDER BY u.github_username;")
    USERS=$(echo "$JSON" | jq -r '.[0].results[] | "\(.github_username)"' 2>/dev/null || true)
    TOTAL=$(echo "$USERS" | grep -c '[^[:space:]]' || echo 0)

    # Detect new users
    CURRENT_NAMES=$(echo "$USERS" | cut -d'|' -f1 | sort)
    if [ -s "$KNOWN_FILE" ]; then
        NEW=$(comm -13 "$KNOWN_FILE" <(echo "$CURRENT_NAMES") | grep -v '^$' || true)
        if [ -n "$NEW" ]; then
            echo "$TS 🆕 New: $NEW"
        fi
    fi
    echo "$CURRENT_NAMES" > "$KNOWN_FILE"

    # Ensure OpenClaw users have at least 20 pack pollen without repeated increments.
    query "UPDATE user SET pack_balance=MAX(COALESCE(pack_balance,0),20) WHERE id IN (SELECT DISTINCT ak.user_id FROM apikey ak WHERE ak.name = 'openclaw.pollinations.ai') AND COALESCE(pack_balance,0) < 20;" >/dev/null

    echo "$TS ✓ Ensured 20 pack pollen for $TOTAL users"

    sleep 120
done
