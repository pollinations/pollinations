#!/bin/bash
# Monitor wrangler logs and play sounds for different events
# Usage: ./scripts/monitor-logs-beep.sh [env]
# Example: ./scripts/monitor-logs-beep.sh staging

ENV=${1:-staging}

echo "Monitoring logs for environment: $ENV"
echo "Will play sounds for:"
echo "  ✅ Success (200) - Tink"
echo "  ⚠️  WARNING - Ping"
echo "  ❌ ERROR - Ping"
echo ""

wrangler tail --env "$ENV" | while read line; do
    echo "$line"
    
    # Check for errors or warnings (alert sound)
    if echo "$line" | grep -qE '(WARNING|ERROR)'; then
        afplay /System/Library/Sounds/Ping.aiff
    # Check for successful requests (pleasant sound)
    elif echo "$line" | grep -qE '(200|success|Success|✅)'; then
        afplay /System/Library/Sounds/Tink.aiff
    fi
done
