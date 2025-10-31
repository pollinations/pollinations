#!/bin/bash
# Monitor wrangler logs and beep on WARNING or ERROR
# Usage: ./scripts/monitor-logs.sh [env]
# Example: ./scripts/monitor-logs.sh staging

ENV=${1:-staging}

echo "Monitoring logs for environment: $ENV"
echo "Will beep on WARNING or ERROR..."
echo ""

wrangler tail --env "$ENV" | grep --line-buffered -E '(WARNING|ERROR)' | while read line; do 
    echo "$line"
    afplay /System/Library/Sounds/Ping.aiff
done
