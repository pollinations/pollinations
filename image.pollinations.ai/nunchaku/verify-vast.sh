#!/bin/bash
# Run on the Vast host after setup-vast.sh. This makes the same deterministic
# request locally and through either CANARY_URL or gen.pollinations.ai, then
# compares decoded image pixels. A registry heartbeat or public /docs check
# alone does not prove that the image path works.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env.flux}"

if [ ! -f "$ENV_FILE" ]; then
    echo "Missing $ENV_FILE; run setup-vast.sh first" >&2
    exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"
: "${PLN_GPU_TOKEN:?PLN_GPU_TOKEN missing from $ENV_FILE}"

PYTHON="$SCRIPT_DIR/venv/bin/python"
if [ ! -x "$PYTHON" ]; then
    echo "Missing $PYTHON; run setup-vast.sh first" >&2
    exit 1
fi

CANARY_DIR=$(mktemp -d)
trap 'rm -rf "$CANARY_DIR"' EXIT

PROMPT="vast-canary-$(date +%s)"
SEED="${SEED:-424242}"
WIDTH="${WIDTH:-512}"
HEIGHT="${HEIGHT:-512}"
CANARY_URL="${CANARY_URL:-}"
CANARY_URL="${CANARY_URL%/}"

echo "Checking local server..."
curl -fsS --max-time 10 "http://localhost:${PORT:-8765}/docs" >/dev/null

echo "Generating the local Vast reference..."
curl -fsS --max-time 180 "http://localhost:${PORT:-8765}/generate" \
    -H "Content-Type: application/json" \
    -H "x-backend-token: $PLN_GPU_TOKEN" \
    --data "{\"prompts\":[\"$PROMPT\"],\"width\":$WIDTH,\"height\":$HEIGHT,\"steps\":4,\"seed\":$SEED}" \
    > "$CANARY_DIR/direct.json"

"$PYTHON" - "$CANARY_DIR/direct.json" "$CANARY_DIR/direct.jpg" <<'PY'
import base64
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    response = json.load(source)
with open(sys.argv[2], "wb") as image:
    image.write(base64.b64decode(response[0]["image"]))
PY

if [ -n "$CANARY_URL" ]; then
    echo "Generating through the isolated canary URL..."
    curl -fsS --max-time 180 "$CANARY_URL/generate" \
        -H "Content-Type: application/json" \
        -H "x-backend-token: $PLN_GPU_TOKEN" \
        --data "{\"prompts\":[\"$PROMPT\"],\"width\":$WIDTH,\"height\":$HEIGHT,\"steps\":4,\"seed\":$SEED}" \
        > "$CANARY_DIR/public.json"
    "$PYTHON" - "$CANARY_DIR/public.json" "$CANARY_DIR/public.jpg" <<'PY'
import base64
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    response = json.load(source)
with open(sys.argv[2], "wb") as image:
    image.write(base64.b64decode(response[0]["image"]))
PY
else
    : "${POLLINATIONS_API_KEY:?Set POLLINATIONS_API_KEY for production-route verification}"
    : "${PUBLIC_IP:?PUBLIC_IP missing from $ENV_FILE}"
    curl -fsS --max-time 10 https://gen.pollinations.ai/register \
        -H "Authorization: Bearer $PLN_GPU_TOKEN" | grep -Fq "https://$PUBLIC_IP"
    PUBLIC_URL="https://gen.pollinations.ai/image/$PROMPT?model=flux&width=$WIDTH&height=$HEIGHT&seed=$SEED&nologo=true"
    echo "Generating through the production Flux route..."
    curl -fsS --max-time 180 "$PUBLIC_URL" \
        -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
        > "$CANARY_DIR/public.jpg"
fi

"$PYTHON" - "$CANARY_DIR/direct.jpg" "$CANARY_DIR/public.jpg" <<'PY'
import sys
from PIL import Image, ImageChops, ImageStat

with Image.open(sys.argv[1]) as direct_image, Image.open(sys.argv[2]) as public_image:
    direct = direct_image.convert("RGB")
    public = public_image.convert("RGB")
    if direct.size != public.size:
        raise SystemExit(f"FAIL: dimensions differ: Vast={direct.size}, public={public.size}")
    rms = sum(ImageStat.Stat(ImageChops.difference(direct, public)).rms) / 3
    if rms > 12:
        raise SystemExit(
            f"FAIL: public image differs from Vast reference (RMS={rms:.2f}); fallback may be active"
        )
    print(f"PASS: external Flux matched the local Vast reference (RMS={rms:.2f})")
PY
