@ -0,0 +1,23 @@
#!/bin/bash
# Monitor wrangler logs and play sounds for different events
# Usage: ./scripts/monitor-logs-beep.sh [env] [--midi]
# Example: ./scripts/monitor-logs-beep.sh staging
# Example with MIDI: ./scripts/monitor-logs-beep.sh staging --midi

ENV=${1:-staging}
USE_MIDI=false

# Check for --midi flag
if [[ "$2" == "--midi" ]] || [[ "$1" == "--midi" ]]; then
    USE_MIDI=true
    [[ "$1" == "--midi" ]] && ENV="staging"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Monitoring logs for environment: $ENV"  
if [ "$USE_MIDI" = true ]; then
    echo "Mode: MIDI notes (use without --midi for system sounds)"
    echo "  ✅ Success (200) - C3 (MIDI 60)"
    echo "  ⚠️  WARNING - C2 (MIDI 48)"
    echo "  ❌ ERROR - C#2 (MIDI 49)"
else
    echo "Mode: System sounds (use --midi for MIDI notes)"
    echo "  ✅ Success (200) - Tink"
    echo "  ⚠️  WARNING - Ping"
    echo "  ❌ ERROR - Ping"
fi
echo ""

wrangler tail --env "$ENV" | while read line; do
    # Check for errors
    if echo "$line" | grep -qE 'ERROR'; then
        echo "❌ $line"
        if [ "$USE_MIDI" = true ]; then
            node "$SCRIPT_DIR/send-midi-note.js" 49 100 150 2>/dev/null &
        else
            afplay /System/Library/Sounds/Ping.aiff &
        fi
    # Check for warnings
    elif echo "$line" | grep -qE 'WARNING'; then
        echo "⚠️  $line"
        if [ "$USE_MIDI" = true ]; then
            node "$SCRIPT_DIR/send-midi-note.js" 48 100 150 2>/dev/null &
        else
            afplay /System/Library/Sounds/Ping.aiff &
        fi
    # Check for successful requests
    elif echo "$line" | grep -qE '(200|success|Success|✅)'; then
        echo "✅ $line"
        if [ "$USE_MIDI" = true ]; then
            node "$SCRIPT_DIR/send-midi-note.js" 60 100 150 2>/dev/null &
        else
            afplay /System/Library/Sounds/Tink.aiff &
        fi
    fi
done
