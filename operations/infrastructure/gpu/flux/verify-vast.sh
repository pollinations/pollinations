#!/bin/bash
# Run on the Vast host after setup-vast.sh. This validates local generation,
# then proves that either an isolated canary URL or the production route reaches
# this exact worker. A registry heartbeat or public /docs check alone does not
# prove that the image path works.

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
PRODUCTION_ATTEMPTS="${PRODUCTION_ATTEMPTS:-8}"
WORKER_LOG="${WORKER_LOG:-/tmp/flux.log}"

if [ ! -f "$WORKER_LOG" ]; then
    echo "Missing $WORKER_LOG; the Flux worker has not produced a log yet" >&2
    exit 1
fi

decode_json_image() {
    "$PYTHON" - "$1" "$2" "$WIDTH" "$HEIGHT" <<'PY'
import base64
import json
import sys
from PIL import Image

with open(sys.argv[1], encoding="utf-8") as source:
    response = json.load(source)
with open(sys.argv[2], "wb") as image:
    image.write(base64.b64decode(response[0]["image"]))
with Image.open(sys.argv[2]) as image:
    expected = (int(sys.argv[3]), int(sys.argv[4]))
    if image.size != expected:
        raise SystemExit(f"FAIL: expected {expected}, got {image.size}")
PY
}

validate_image() {
    "$PYTHON" - "$1" "$WIDTH" "$HEIGHT" <<'PY'
import sys
from PIL import Image

with Image.open(sys.argv[1]) as image:
    expected = (int(sys.argv[2]), int(sys.argv[3]))
    if image.size != expected:
        raise SystemExit(f"FAIL: expected {expected}, got {image.size}")
    image.verify()
PY
}

echo "Checking local server..."
curl -fsS --max-time 10 "http://localhost:${PORT:-8765}/docs" >/dev/null

echo "Generating and validating a local image..."
curl -fsS --max-time 180 "http://localhost:${PORT:-8765}/generate" \
    -H "Content-Type: application/json" \
    -H "x-backend-token: $PLN_GPU_TOKEN" \
    --data "{\"prompts\":[\"$PROMPT-local\"],\"width\":$WIDTH,\"height\":$HEIGHT,\"steps\":4,\"seed\":$SEED}" \
    > "$CANARY_DIR/local.json"
decode_json_image "$CANARY_DIR/local.json" "$CANARY_DIR/local.jpg"

if [ -n "$CANARY_URL" ]; then
    external_prompt="$PROMPT-external"
    before=$(grep -Fc "$external_prompt" "$WORKER_LOG" 2>/dev/null || true)
    echo "Generating through the isolated canary URL..."
    curl -fsS --max-time 180 "$CANARY_URL/generate" \
        -H "Content-Type: application/json" \
        -H "x-backend-token: $PLN_GPU_TOKEN" \
        --data "{\"prompts\":[\"$external_prompt\"],\"width\":$WIDTH,\"height\":$HEIGHT,\"steps\":4,\"seed\":$SEED}" \
        > "$CANARY_DIR/external.json"
    decode_json_image "$CANARY_DIR/external.json" "$CANARY_DIR/external.jpg"
    after=$(grep -Fc "$external_prompt" "$WORKER_LOG" 2>/dev/null || true)
    if [ "$after" -le "$before" ]; then
        echo "FAIL: isolated request was not attributed in $WORKER_LOG" >&2
        exit 1
    fi
    echo "PASS: isolated URL returned a valid image from this worker"
    exit 0
fi

: "${POLLINATIONS_API_KEY:?Set POLLINATIONS_API_KEY for production-route verification}"
: "${PUBLIC_IP:?PUBLIC_IP missing from $ENV_FILE}"

registry=$(curl -fsS --max-time 10 https://gen.pollinations.ai/register \
    -H "Authorization: Bearer $PLN_GPU_TOKEN")
if ! grep -Fq "https://$PUBLIC_IP" <<<"$registry"; then
    echo "FAIL: https://$PUBLIC_IP is missing from the production registry" >&2
    exit 1
fi

echo "Checking production attribution (up to $PRODUCTION_ATTEMPTS requests)..."
for attempt in $(seq 1 "$PRODUCTION_ATTEMPTS"); do
    public_prompt="$PROMPT-production-$attempt"
    before=$(grep -Fc "$public_prompt" "$WORKER_LOG" 2>/dev/null || true)
    public_url="https://gen.pollinations.ai/image/$public_prompt?model=flux&width=$WIDTH&height=$HEIGHT&seed=$SEED&nologo=true"
    curl -fsS --max-time 180 "$public_url" \
        -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
        > "$CANARY_DIR/production-$attempt.jpg"
    validate_image "$CANARY_DIR/production-$attempt.jpg"
    after=$(grep -Fc "$public_prompt" "$WORKER_LOG" 2>/dev/null || true)
    if [ "$after" -gt "$before" ]; then
        echo "PASS: production returned a valid image from this worker on attempt $attempt"
        exit 0
    fi
done

echo "FAIL: no production request was attributed to this worker" >&2
exit 1
