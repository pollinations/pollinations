#!/usr/bin/env zsh
# render.sh [tape] — record polli CLI demo with live BlackHole audio capture.
#
# Pre-req: default system output = BlackHole 2ch (System Settings → Sound).
# Switch back to Speakers after.
#
# Produces: <base>.mp4 (final, audio+video muxed) where <base> is the tape
# filename minus .tape. Defaults to demo.tape.

cd "$(dirname "$0")"

TAPE="${1:-demo.tape}"
BASE="${TAPE%.tape}"

# Archive previous renders for this base
ts=$(date +%H%M)
for f in "$BASE.mp4" "$BASE-silent.mp4" captured.wav captured-trim.wav; do
    [ -f "$f" ] && mv "$f" "${f%.*}-v$ts.${f##*.}"
done

# Start audio capture via sox + CoreAudio (more stable than ffmpeg avfoundation
# for long recordings; no device-index dance, addresses BlackHole by name).
AUDIODRIVER=coreaudio sox -q -c 2 -r 48000 -t coreaudio "BlackHole 2ch" \
    -c 2 -r 48000 -b 16 captured.wav 2>/tmp/sox-capture.log &
FFPID=$!
trap "kill -INT $FFPID 2>/dev/null; wait $FFPID 2>/dev/null" EXIT
sleep 2.5

# (Optional) play external music through BlackHole in parallel so it gets captured too
# afplay music.mp3 &

# Render — VHS plays TTS via afplay → default output (BlackHole) → ffmpeg captures
vhs "$TAPE"

# Let trailing audio flush, then stop capture
sleep 2
kill -INT $FFPID 2>/dev/null
wait $FFPID 2>/dev/null
trap - EXIT

# Mux: keep video, shift captured audio forward 2s so narrations land
# earlier relative to video (ffmpeg pre-roll + API roundtrip offset).
VID_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$BASE-silent.mp4")
ffmpeg -y -ss 4 -i captured.wav -i "$BASE-silent.mp4" \
    -t "$VID_DUR" -c:v copy -c:a aac -map 1:v -map 0:a \
    "$BASE.mp4" 2>/dev/null

V=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$BASE.mp4")
SZ=$(stat -f%z "$BASE.mp4")
echo "$BASE.mp4  dur=${V}s  size=${SZ}B"
open "$BASE.mp4"
