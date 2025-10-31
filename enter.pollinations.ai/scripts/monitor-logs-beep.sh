@ -0,0 +1,23 @@
#!/bin/bash
# Monitor wrangler logs and beep on requests and errors
# Usage: ./scripts/monitor-logs-beep.sh [env]
# Example: ./scripts/monitor-logs-beep.sh staging
# Sounds: Submarine (requests with [PROXY]), Ping (errors/warnings)

ENV=${1:-staging}

echo "Monitoring logs for environment: $ENV"
echo "Sounds: Submarine (requests), Ping (errors/warnings)"
echo ""

wrangler tail --env "$ENV" | while read line; do 
    echo "$line"
    
    # Check if line contains WARNING or ERROR
    if echo "$line" | grep -qE '(WARNING|ERROR)'; then
        afplay /System/Library/Sounds/Ping.aiff &
    # Check if line contains [PROXY] (actual request processing)
    elif echo "$line" | grep -q '\[PROXY\]'; then
        afplay /System/Library/Sounds/Submarine.aiff &
    fi
done