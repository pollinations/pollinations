#!/bin/bash
# Flux Schnell worker setup for a Vast.ai instance (single GPU).
#
# Vast instances are docker containers (root, no systemd), so this installs
# into a venv and runs server.py inside a screen session with a restart loop
# (server.py exits on CUDA errors and expects its supervisor to restart it).
#
# Tested against vastai/base-image:cuda-13.0.2-cudnn-devel-ubuntu24.04-py312.
# The prebuilt nunchaku wheel bundles SM 7.5/8.0/8.6/8.9/120 kernels, so the
# same setup works on RTX 4090 (INT4 model) and RTX 5090 (FP4 model).
#
# Usage (on the instance):
#   PLN_GPU_TOKEN=... \
#   PUBLIC_PORT=<external port mapped to 8765> \
#   bash setup-vast.sh
#
# Optional env:
#   HF_TOKEN          not required — FLUX.1-schnell and the nunchaku quant
#                     repos are public; set it only to avoid anon rate limits
#   QUANT_MODEL_PATH  default mit-han-lab/svdq-fp4-flux.1-schnell (Blackwell);
#                     use mit-han-lab/svdq-int4-flux.1-schnell on Ada GPUs
#   MAX_PIXELS        default 1048576 (1024x1024, matches FP4/5090);
#                     use 810000 on RTX 4090
#   PUBLIC_IP         default: auto-detected by server.py
#   SERVICE_TYPE      default flux
#   GIT_BRANCH        default main
#   WORK_DIR          default /workspace/pollinations

set -e

GIT_BRANCH="${GIT_BRANCH:-main}"
WORK_DIR="${WORK_DIR:-/workspace/pollinations}"
QUANT_MODEL_PATH="${QUANT_MODEL_PATH:-mit-han-lab/svdq-fp4-flux.1-schnell}"
MAX_PIXELS="${MAX_PIXELS:-1048576}"
SERVICE_TYPE="${SERVICE_TYPE:-flux}"
PORT="${PORT:-8765}"
SUDO=""
[ "$(id -u)" != "0" ] && SUDO="sudo"

log() { echo -e "\033[0;32m[setup-vast]\033[0m $1"; }

for var in PLN_GPU_TOKEN PUBLIC_PORT; do
    if [ -z "${!var}" ]; then
        echo "Missing required environment variable: $var" >&2
        echo "Usage: PLN_GPU_TOKEN=... PUBLIC_PORT=... bash setup-vast.sh" >&2
        exit 1
    fi
done

log "Installing system packages..."
$SUDO apt-get update -qq
$SUDO apt-get install -y -qq git screen python3.12-venv python3.12-dev

if [ -d "$WORK_DIR" ]; then
    log "Updating existing repo ($GIT_BRANCH)..."
    git -C "$WORK_DIR" fetch --depth 1 origin "$GIT_BRANCH"
    git -C "$WORK_DIR" checkout FETCH_HEAD
else
    log "Cloning repo ($GIT_BRANCH)..."
    git clone --depth 1 --branch "$GIT_BRANCH" \
        https://github.com/pollinations/pollinations.git "$WORK_DIR"
fi

NUNCHAKU_DIR="$WORK_DIR/image.pollinations.ai/nunchaku"
cd "$NUNCHAKU_DIR"

if [ ! -d venv ]; then
    log "Creating venv..."
    python3.12 -m venv venv
fi
source venv/bin/activate
pip install --upgrade -q pip

log "Installing PyTorch 2.9.1 cu128 (matches prebuilt nunchaku wheel)..."
pip install -q torch==2.9.1 torchvision==0.24.1 --index-url https://download.pytorch.org/whl/cu128

log "Installing requirements..."
pip install -q -r requirements.txt

log "Installing prebuilt nunchaku wheel (SM 7.5/8.0/8.6/8.9/120)..."
pip install -q --no-cache-dir --no-deps \
    "https://github.com/nunchaku-ai/nunchaku/releases/download/v1.2.1/nunchaku-1.2.1+cu12.8torch2.9-cp312-cp312-linux_x86_64.whl"

python -c "from nunchaku import NunchakuFluxTransformer2dModel; print('nunchaku OK')"
python -c "import torch; assert torch.cuda.is_available(); print('CUDA OK:', torch.cuda.get_device_name(0))"

log "Writing run environment to $NUNCHAKU_DIR/.env.flux..."
cat > "$NUNCHAKU_DIR/.env.flux" <<EOF
${HF_TOKEN:+export HF_TOKEN=$HF_TOKEN}
export PLN_GPU_TOKEN=$PLN_GPU_TOKEN
export PORT=$PORT
export PUBLIC_PORT=$PUBLIC_PORT
export SERVICE_TYPE=$SERVICE_TYPE
export QUANT_MODEL_PATH=$QUANT_MODEL_PATH
export MAX_PIXELS=$MAX_PIXELS
export CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES:-0}
${PUBLIC_IP:+export PUBLIC_IP=$PUBLIC_IP}
EOF
chmod 600 "$NUNCHAKU_DIR/.env.flux"

log "Starting server in screen session 'flux' (restart loop, log: /tmp/flux.log)..."
screen -S flux -X quit 2>/dev/null || true
screen -dmS flux bash -c "cd $NUNCHAKU_DIR && source venv/bin/activate && source .env.flux && \
    while true; do python server.py 2>&1 | tee -a /tmp/flux.log; \
    echo \"[setup-vast] server exited, restarting in 5s\" | tee -a /tmp/flux.log; sleep 5; done"

log "Done. Model load takes 2-3 min on first start."
log "  Logs:       tail -f /tmp/flux.log"
log "  Attach:     screen -r flux   (detach: Ctrl+A, D)"
log "  Local test: curl -s localhost:$PORT/docs >/dev/null && echo up"
log "  Registered: curl -s https://gen.pollinations.ai/register | grep -o '$SERVICE_TYPE[^,]*'"
