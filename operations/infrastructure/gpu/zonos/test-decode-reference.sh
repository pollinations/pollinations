#!/bin/sh
set -eu

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
install -m 755 "$(dirname "$0")/decode-reference.sh" "$work/ffmpeg"
# The runtime locates this wrapper next to its executable. It must also work
# with that directory first in PATH.
export PATH="$work:$PATH"
for format in wav mp3 flac ogg aac m4a webm; do
    /usr/bin/ffmpeg -v error -f lavfi -i sine=duration=0.1 "$work/sample.$format"
    "$work/ffmpeg" -v error -i "$work/sample.$format" -f null -
done

/usr/bin/ffmpeg -v error -i "$work/sample.wav" "$work/sample.aiff"
if "$work/ffmpeg" -v error -i "$work/sample.aiff" -f null -; then
    echo "Unexpectedly accepted AIFF" >&2
    exit 1
fi
if "$work/ffmpeg" -v error -i pipe:0 -f null - < "$work/sample.wav"; then
    echo "Unexpectedly accepted a non-file input" >&2
    exit 1
fi
