#!/bin/bash
# Verify the local Z-Image server and its stable Vast tunnel before production
# registration. Both routes must return the same deterministic pixels.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env.zimage}"

if [ ! -f "$ENV_FILE" ]; then
    echo "Missing $ENV_FILE; run setup-vast.sh first" >&2
    exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"
: "${PLN_GPU_TOKEN:?PLN_GPU_TOKEN missing from $ENV_FILE}"
: "${PUBLIC_IP:?PUBLIC_IP missing from $ENV_FILE}"

if [ "${HEARTBEAT_ENABLED:-true}" != "false" ]; then
    echo "Refusing pre-production verification while HEARTBEAT_ENABLED is not false" >&2
    exit 1
fi

VERIFY_DIR="$(mktemp -d)"
trap 'rm -rf "$VERIFY_DIR"' EXIT

wait_for_health() {
    for _ in $(seq 1 180); do
        if curl -fsS --max-time 5 "http://localhost:${PORT:-10002}/health" >/dev/null; then
            return 0
        fi
        sleep 5
    done
    echo "Z-Image did not become healthy" >&2
    return 1
}

generate() {
    local base_url="$1"
    local width="$2"
    local height="$3"
    local output="$4"
    curl -fsS --max-time 180 "$base_url/generate" \
        -H "Content-Type: application/json" \
        -H "x-backend-token: $PLN_GPU_TOKEN" \
        --data "{\"prompts\":[\"vast zimage deterministic canary\"],\"width\":$width,\"height\":$height,\"seed\":424242}" \
        > "$output"
}

wait_for_health
curl -fsS --max-time 10 "https://$PUBLIC_IP/health" >/dev/null

for size in 512x512 1024x1024 768x1152; do
    width="${size%x*}"
    height="${size#*x}"
    echo "Verifying $size"
    generate "http://localhost:${PORT:-10002}" "$width" "$height" "$VERIFY_DIR/local-$size.json"
    generate "https://$PUBLIC_IP" "$width" "$height" "$VERIFY_DIR/tunnel-$size.json"
done

"${VENV:-/workspace/zimage-venv}/bin/python" - "$VERIFY_DIR" <<'PY'
import base64
import io
import json
import pathlib
import sys

from PIL import Image, ImageChops, ImageStat

root = pathlib.Path(sys.argv[1])
for local_path in sorted(root.glob("local-*.json")):
    suffix = local_path.name.removeprefix("local-")
    tunnel_path = root / f"tunnel-{suffix}"
    local = json.loads(local_path.read_text())[0]
    tunnel = json.loads(tunnel_path.read_text())[0]
    with Image.open(io.BytesIO(base64.b64decode(local["image"]))) as left, Image.open(
        io.BytesIO(base64.b64decode(tunnel["image"]))
    ) as right:
        left_rgb = left.convert("RGB")
        right_rgb = right.convert("RGB")
        if left_rgb.size != right_rgb.size:
            raise SystemExit(f"FAIL {suffix}: dimensions differ")
        rms = sum(ImageStat.Stat(ImageChops.difference(left_rgb, right_rgb)).rms) / 3
        if rms > 0.1:
            raise SystemExit(f"FAIL {suffix}: RMS pixel difference {rms:.3f}")
        print(f"PASS {suffix}: {left_rgb.size[0]}x{left_rgb.size[1]}, RMS={rms:.3f}")
PY

echo "Direct and tunnel verification passed; production heartbeat remains disabled"
