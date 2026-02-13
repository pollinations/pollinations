#!/bin/bash
# Auto-upgrade OpenClaw users below seed tier every 120s
# Usage: bash apps/openclaw/auto-upgrade-openclaw-users.sh

DIR="$(cd "$(dirname "$0")/../../enter.pollinations.ai" && pwd)"
KNOWN_FILE=$(mktemp)

query() {
    cd "$DIR" && npx wrangler d1 execute DB --remote --env production --json --command "$1" 2>/dev/null
}

while true; do
    TS="[$(date +%H:%M:%S)]"

    JSON=$(query "SELECT u.github_username, u.tier FROM user u JOIN apikey ak ON ak.user_id = u.id WHERE ak.name = 'openclaw.pollinations.ai' GROUP BY u.id ORDER BY u.github_username;")
    USERS=$(echo "$JSON" | jq -r '.[0].results[] | "\(.github_username)|\(.tier)"' 2>/dev/null || true)
    TOTAL=$(echo "$USERS" | grep -c '|' || echo 0)

    # Detect new users
    CURRENT_NAMES=$(echo "$USERS" | cut -d'|' -f1 | sort)
    if [ -s "$KNOWN_FILE" ]; then
        NEW=$(comm -13 "$KNOWN_FILE" <(echo "$CURRENT_NAMES") | grep -v '^$' || true)
        if [ -n "$NEW" ]; then
            echo "$TS 🆕 New: $NEW"
        fi
    fi
    echo "$CURRENT_NAMES" > "$KNOWN_FILE"

    # Upgrade anyone below seed, give 20 pollen pack balance
    query "UPDATE user SET tier='seed', tier_balance=3, pack_balance=COALESCE(pack_balance,0)+20 WHERE id IN (SELECT DISTINCT ak.user_id FROM apikey ak WHERE ak.name = 'openclaw.pollinations.ai') AND tier IN ('microbe', 'spore');" >/dev/null

    BELOW=$(echo "$USERS" | grep -cE '\|(spore|microbe)$' 2>/dev/null || echo "0")
    BELOW=$(echo "$BELOW" | tr -d '[:space:]')
    if [ "$BELOW" -gt 0 ]; then
        echo "$TS ⬆️  Upgraded $BELOW to seed + 20 pollen ($TOTAL total)"
    else
        echo "$TS ✓ $TOTAL total, all at seed+"
    fi

    sleep 120
done
