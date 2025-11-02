#!/bin/bash
# Monitor wrangler logs and send MIDI notes for different events
# Usage: ./scripts/monitor-logs-beep.sh [env]
# Example: ./scripts/monitor-logs-beep.sh staging

ENV=${1:-staging}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Monitoring logs for environment: $ENV"
echo "Will send MIDI notes for:"
echo "  ✅ Success (200) - C3 (MIDI 60)"
echo "  ⚠️  WARNING - C2 (MIDI 48)"
echo "  ❌ ERROR - C#2 (MIDI 49)"
echo ""

wrangler tail --env "$ENV" | while read line; do
    # Check for errors (C#2 - higher note)
    if echo "$line" | grep -qE 'ERROR'; then
        echo "❌ $line"
        node "$SCRIPT_DIR/send-midi-note.js" 49 100 150 2>/dev/null &
    # Check for warnings (C2 - lower note)
    elif echo "$line" | grep -qE 'WARNING'; then
        echo "⚠️  $line"
        node "$SCRIPT_DIR/send-midi-note.js" 48 100 150 2>/dev/null &
    # Check for successful requests (C3 - higher note)
    elif echo "$line" | grep -qE '(200|success|Success|✅)'; then
        echo "✅ $line"
        node "$SCRIPT_DIR/send-midi-note.js" 60 100 150 2>/dev/null &
    fi
done
