#!/bin/bash
# meditate.sh — Generate a soothing TTS meditation audio via Pollinations
# Usage: bash meditate.sh "Your meditation text here"
# Requires: POLLINATIONS_API_KEY env var (or works without for free tier)

set -e

TEXT="$1"
if [ -z "$TEXT" ]; then
    echo "Usage: meditate.sh \"<meditation text>\""
    exit 1
fi

# Output directory
OUT_DIR="${HOME}/founder-meditations"
mkdir -p "$OUT_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUT_FILE="${OUT_DIR}/meditation-${TIMESTAMP}.mp3"

echo "🧘 Generating your meditation audio..."
echo "   Voice: charlotte (calm, warm)"
echo "   Output: ${OUT_FILE}"
echo ""

# Use Pollinations TTS API with a calm ElevenLabs voice
# charlotte = warm, soothing female voice perfect for meditation
API_KEY="sk_zJv4vyQXkd4H7OiwWA27dnJZhQ2x6fBN"
AUTH_HEADER=""
if [ -n "$API_KEY" ]; then
    AUTH_HEADER="-H \"Authorization: Bearer ${API_KEY}\""
fi

curl -s -X POST "https://gen.pollinations.ai/v1/audio/speech" \
    -H "Content-Type: application/json" \
    ${API_KEY:+-H "Authorization: Bearer ${API_KEY}"} \
    -d "$(cat <<EOF
{
    "input": $(echo "$TEXT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'),
    "voice": "charlotte",
    "response_format": "mp3",
    "speed": 0.9
}
EOF
)" \
    -o "$OUT_FILE"

FILE_SIZE=$(wc -c < "$OUT_FILE" | tr -d ' ')

if [ "$FILE_SIZE" -lt 1000 ]; then
    echo "⚠️  Audio file seems too small (${FILE_SIZE} bytes). The API might have returned an error."
    cat "$OUT_FILE"
    rm "$OUT_FILE"
    exit 1
fi

echo "✅ Meditation ready: ${OUT_FILE}"
echo "   Size: $(du -h "$OUT_FILE" | cut -f1)"
echo ""
echo "🎧 Put on headphones, close your eyes, and press play."
echo ""

# Play audio directly (no iTunes/Music.app hijack)
if command -v afplay >/dev/null 2>&1; then
    afplay "$OUT_FILE" &
elif command -v mpv >/dev/null 2>&1; then
    mpv --no-video "$OUT_FILE" &
elif command -v aplay >/dev/null 2>&1; then
    aplay "$OUT_FILE" &
fi
