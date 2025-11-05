@ -0,0 +1,23 @@
#!/bin/bash
# Monitor wrangler logs and play MIDI notes for HTTP status codes
# Usage: ./scripts/monitor-logs-beep.sh [env]
# Example: ./scripts/monitor-logs-beep.sh staging

ENV=${1:-staging}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Monitoring logs for environment: $ENV"
echo "MIDI Note Mapping (Musical Logic):"
echo "  ✅ 200 Success      - C3  (MIDI 60) - Reference note"
echo "  ✅ 204 No Content   - B2  (MIDI 59) - Slightly lower"
echo "  ⚠️  401 Unauthorized - F2  (MIDI 41) - Minor third (dissonant)"
echo "  ⚠️  404 Not Found    - F#2 (MIDI 42) - Tritone (very dissonant)"
echo "  ⚠️  429 Rate Limited - G2  (MIDI 43) - Diminished fifth (dissonant)"
echo "  ❌ 500 Server Error - Db2 (MIDI 37) - Very low, very dissonant"
echo ""

wrangler tail --env "$ENV" | stdbuf -oL grep 'RESPONSE' | while read -r line; do
    # Strip ANSI color codes for clean parsing (handle both \x1b and \u001b formats)
    clean_line=$(printf '%b' "$line" | sed $'s/\x1b\[[0-9;]*m//g')
    
    echo "[DEBUG] Clean line: $clean_line"
    
    # Extract the status code (simple pattern: RESPONSE followed by space and 3 digits)
    status=$(echo "$clean_line" | grep -oE 'RESPONSE [0-9]{3}' | grep -oE '[0-9]{3}')
    
    echo "[DEBUG] Extracted status: $status"
    
    # Map status codes to MIDI notes and show the full log line
    case $status in
        200)
            echo "✅ $line"
            node "$SCRIPT_DIR/send-midi-note.js" 60 100 150 2>/dev/null &
            ;;
        204)
            echo "✅ $line"
            node "$SCRIPT_DIR/send-midi-note.js" 59 100 150 2>/dev/null &
            ;;
        401)
            echo "⚠️  $line"
            node "$SCRIPT_DIR/send-midi-note.js" 41 100 200 2>/dev/null &
            ;;
        404)
            echo "⚠️  $line"
            node "$SCRIPT_DIR/send-midi-note.js" 42 100 200 2>/dev/null &
            ;;
        429)
            echo "⚠️  $line"
            node "$SCRIPT_DIR/send-midi-note.js" 43 100 200 2>/dev/null &
            ;;
        500)
            echo "❌ $line"
            node "$SCRIPT_DIR/send-midi-note.js" 37 100 250 2>/dev/null &
            ;;
        *)
            echo "❓ $line"
            ;;
    esac
done
