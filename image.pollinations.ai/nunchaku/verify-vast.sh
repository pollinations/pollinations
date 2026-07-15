#!/bin/bash
# Run on the Vast host after setup-vast.sh. This makes the same deterministic
# request directly and through gen.pollinations.ai, then compares decoded image
# pixels. A registry heartbeat or public /docs check alone does not prove that a
# Cloudflare Worker can reach the tunnel; the public request may silently use a
# fallback provider.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env.flux}"

if [ ! -f "$ENV_FILE" ]; then
    echo "Missing $ENV_FILE; run setup-vast.sh first" >&2
    exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"
: "${POLLINATIONS_API_KEY:?Set POLLINATIONS_API_KEY to a valid API key}"
: "${PLN_GPU_TOKEN:?PLN_GPU_TOKEN missing from $ENV_FILE}"
: "${PUBLIC_IP:?PUBLIC_IP missing from $ENV_FILE}"

CANARY_DIR=$(mktemp -d)
trap 'rm -rf "$CANARY_DIR"' EXIT

PROMPT="vast-canary-$(date +%s)"
SEED="${SEED:-424242}"
WIDTH="${WIDTH:-512}"
HEIGHT="${HEIGHT:-512}"
PUBLIC_URL="https://gen.pollinations.ai/image/$PROMPT?model=flux&width=$WIDTH&height=$HEIGHT&seed=$SEED&nologo=true"

echo "Checking local server and registered hostname..."
curl -fsS --max-time 10 "http://localhost:${PORT:-8765}/docs" >/dev/null
curl -fsS --max-time 10 https://gen.pollinations.ai/register \
    -H "Authorization: Bearer $PLN_GPU_TOKEN" | grep -Fq "https://$PUBLIC_IP"

echo "Generating the direct Vast reference..."
curl -fsS --max-time 180 "https://$PUBLIC_IP/generate" \
    -H "Content-Type: application/json" \
    -H "x-backend-token: $PLN_GPU_TOKEN" \
    --data "{\"prompts\":[\"$PROMPT\"],\"width\":$WIDTH,\"height\":$HEIGHT,\"steps\":4,\"seed\":$SEED}" \
    > "$CANARY_DIR/direct.json"

python - "$CANARY_DIR/direct.json" "$CANARY_DIR/direct.jpg" <<'PY'
import base64
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    response = json.load(source)
with open(sys.argv[2], "wb") as image:
    image.write(base64.b64decode(response[0]["image"]))
PY

echo "Generating through the public Flux route..."
curl -fsS --max-time 180 "$PUBLIC_URL" \
    -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
    > "$CANARY_DIR/public.jpg"

python - "$CANARY_DIR/direct.jpg" "$CANARY_DIR/public.jpg" <<'PY'
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
    print(f"PASS: public Flux matched Vast reference (RMS={rms:.2f})")
PY
