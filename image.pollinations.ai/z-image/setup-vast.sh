#!/bin/bash
# Provision Z-Image Turbo on a single-GPU Vast.ai SSH instance.
#
# Vast instances are root-owned containers without systemd. This script uses a
# pinned Blackwell-capable PyTorch runtime and supervises the model server and a
# remotely managed Cloudflare Tunnel in screen restart loops.
#
# Production registration is disabled by default. Run verify-vast.sh and the
# benchmark first, then set HEARTBEAT_ENABLED=true in .env.zimage and restart.
#
# Usage:
#   PLN_GPU_TOKEN=... \
#   CLOUDFLARED_TUNNEL_TOKEN=... \
#   PUBLIC_HOSTNAME=zimage-vast-NN.pollinations.ai \
#   bash setup-vast.sh

set -euo pipefail

GIT_BRANCH="${GIT_BRANCH:-main}"
WORK_DIR="${WORK_DIR:-/workspace/pollinations}"
VENV="${VENV:-/workspace/zimage-venv}"
MODEL_CACHE="${MODEL_CACHE:-/workspace/zimage-cache}"
SERVICE_TYPE="${SERVICE_TYPE:-zimage}"
PORT="${PORT:-10002}"
HEARTBEAT_ENABLED="${HEARTBEAT_ENABLED:-false}"
SUDO=""
[ "$(id -u)" != "0" ] && SUDO="sudo"

log() { echo "[setup-vast] $1"; }

if [ -z "${PLN_GPU_TOKEN:-}" ] || [ -z "${CLOUDFLARED_TUNNEL_TOKEN:-}" ] || [ -z "${PUBLIC_HOSTNAME:-}" ]; then
    echo "Usage: PLN_GPU_TOKEN=... CLOUDFLARED_TUNNEL_TOKEN=... PUBLIC_HOSTNAME=zimage-vast-NN.pollinations.ai bash setup-vast.sh" >&2
    exit 1
fi

case "$PUBLIC_HOSTNAME" in
    *[!A-Za-z0-9.-]*)
        echo "PUBLIC_HOSTNAME must be a hostname without a scheme or path" >&2
        exit 1
        ;;
esac

log "Installing system packages"
$SUDO apt-get update -qq
$SUDO apt-get install -y -qq curl git screen python3.12-venv python3.12-dev

# CUDA forward-compat libraries can fail on GeForce when the host driver is
# older than the container toolkit. Use the host driver, as on the Flux Vast
# deployment.
if find /usr/local -maxdepth 3 -path '/usr/local/cuda-*/compat/libcuda.so*' -print -quit 2>/dev/null | grep -q .; then
    log "Disabling CUDA forward-compat libraries"
    mkdir -p /root/cuda-compat-disabled
    find /usr/local -maxdepth 3 -path '/usr/local/cuda-*/compat/libcuda.so*' \
        -exec mv -t /root/cuda-compat-disabled/ {} +
    $SUDO ldconfig
fi

if ! command -v cloudflared >/dev/null || \
    ! cloudflared tunnel run --help 2>&1 | grep -q -- '--token-file'; then
    log "Installing cloudflared"
    curl -fsSL --retry 5 -o /tmp/cloudflared.deb \
        https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    $SUDO dpkg -i /tmp/cloudflared.deb >/dev/null
fi

TUNNEL_TOKEN_FILE="$HOME/.cloudflared/tunnel-token"
install -d -m 700 "$HOME/.cloudflared"
printf '%s' "$CLOUDFLARED_TUNNEL_TOKEN" > "$TUNNEL_TOKEN_FILE"
chmod 600 "$TUNNEL_TOKEN_FILE"
unset CLOUDFLARED_TUNNEL_TOKEN

if [ -n "${SKIP_CLONE:-}" ]; then
    log "Using existing files in $WORK_DIR"
elif [ -d "$WORK_DIR/.git" ]; then
    log "Updating repository to $GIT_BRANCH"
    git -C "$WORK_DIR" fetch --depth 1 origin "$GIT_BRANCH"
    git -C "$WORK_DIR" checkout FETCH_HEAD
else
    log "Cloning repository branch $GIT_BRANCH"
    git clone --depth 1 --branch "$GIT_BRANCH" \
        https://github.com/pollinations/pollinations.git "$WORK_DIR"
fi

ZIMAGE_DIR="$WORK_DIR/image.pollinations.ai/z-image"
mkdir -p "$MODEL_CACHE/span"

if [ ! -d "$VENV" ]; then
    log "Creating Python environment"
    python3.12 -m venv "$VENV"
fi

PIP_FLAGS="--resume-retries 20 --timeout 60 --retries 10"
"$VENV/bin/pip" install --upgrade -q pip
log "Installing PyTorch 2.9.1 cu128"
"$VENV/bin/pip" install -q $PIP_FLAGS \
    torch==2.9.1 torchvision==0.24.1 \
    --index-url https://download.pytorch.org/whl/cu128
log "Installing Z-Image dependencies"
"$VENV/bin/pip" install -q $PIP_FLAGS \
    -r "$ZIMAGE_DIR/requirements.txt" \
    -c "$ZIMAGE_DIR/constraints-vast.txt"

log "Verifying CUDA and Blackwell support"
"$VENV/bin/python" - <<'PY'
import torch

assert torch.cuda.is_available(), "CUDA is not available"
assert "sm_120" in torch.cuda.get_arch_list(), "PyTorch build lacks RTX 5090 support"
print("CUDA OK:", torch.__version__, torch.version.cuda, torch.cuda.get_device_name(0))
PY

log "Downloading SPAN upscaler"
MODEL_CACHE="$MODEL_CACHE" "$VENV/bin/python" - <<'PY'
import os
from huggingface_hub import hf_hub_download

hf_hub_download(
    repo_id="Phips/2xNomosUni_span_multijpg",
    filename="2xNomosUni_span_multijpg.safetensors",
    local_dir=os.path.join(os.environ["MODEL_CACHE"], "span"),
)
PY

ENV_FILE="$ZIMAGE_DIR/.env.zimage"
log "Writing runtime environment to $ENV_FILE"
{
    printf 'export PLN_GPU_TOKEN=%q\n' "$PLN_GPU_TOKEN"
    printf 'export PORT=%q\n' "$PORT"
    printf 'export PUBLIC_PORT=443\n'
    printf 'export PUBLIC_IP=%q\n' "$PUBLIC_HOSTNAME"
    printf 'export SERVICE_TYPE=%q\n' "$SERVICE_TYPE"
    printf 'export HEARTBEAT_ENABLED=%q\n' "$HEARTBEAT_ENABLED"
    printf 'export VENV=%q\n' "$VENV"
    printf 'export MODEL_CACHE=%q\n' "$MODEL_CACHE"
    printf 'export SPAN_MODEL_PATH=%q\n' "$MODEL_CACHE/span/2xNomosUni_span_multijpg.safetensors"
    printf 'export HF_HUB_CACHE=%q\n' "$MODEL_CACHE/hub"
    printf 'export HF_XET_HIGH_PERFORMANCE=1\n'
    printf 'export CUDA_VISIBLE_DEVICES=0\n'
    # cuDNN v8's VAE convolution path segfaults with exit 139 on the tested
    # RTX 5090 / driver 570 / cu128 stack. The legacy API remains GPU-backed
    # and completes the same decode successfully.
    printf 'export TORCH_CUDNN_V8_API_DISABLED=1\n'
    printf 'export SPAN_DISABLE_CUDNN=1\n'
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"
unset PLN_GPU_TOKEN

cat > /root/run-zimage.sh <<EOF
#!/bin/bash
set -a
source "$ENV_FILE"
set +a
cd "$ZIMAGE_DIR"
exec "$VENV/bin/python" -u server.py
EOF
chmod 700 /root/run-zimage.sh

cat > /root/onstart.sh <<EOF
#!/bin/bash
screen -S zimage -X quit 2>/dev/null || true
screen -S cloudflared -X quit 2>/dev/null || true
screen -dmS zimage bash -c 'while true; do /root/run-zimage.sh >> /root/zimage.log 2>&1; sleep 5; done'
screen -dmS cloudflared bash -c 'while true; do cloudflared tunnel --no-autoupdate run --token-file "$TUNNEL_TOKEN_FILE" >> /root/cloudflared.log 2>&1; sleep 5; done'
EOF
chmod 700 /root/onstart.sh

/root/onstart.sh

log "Z-Image is starting with production heartbeat=$HEARTBEAT_ENABLED"
log "Model logs: tail -f /root/zimage.log"
log "Tunnel logs: tail -f /root/cloudflared.log"
log "Run verification before enabling production registration"
