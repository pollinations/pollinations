#!/bin/bash
# Flux Schnell worker setup for a Vast.ai instance (single GPU).
#
# Vast instances are docker containers (root, no systemd), so this installs
# into a venv and runs server.py inside a screen session with a restart loop
# (server.py exits on CUDA errors and expects its supervisor to restart it).
#
# IMPORTANT — Cloudflare Tunnel required: the gen worker (Cloudflare Worker)
# cannot fetch() raw-IP/non-standard-port origins, so a NAT'd http://IP:PORT
# heartbeat URL is unreachable from routing. Set TUNNEL_NAME and place the
# pollinations.ai account cert at ~/.cloudflared/cert.pem — this script then
# creates/routes/runs the tunnel and the worker advertises
# https://$TUNNEL_NAME.pollinations.ai.
#
# Tested against vastai/base-image:cuda-13.0.2-cudnn-devel-ubuntu24.04-py312.
# The prebuilt nunchaku wheel bundles SM 7.5/8.0/8.6/8.9/120 kernels, so the
# same setup works on RTX 4090 (INT4 model) and RTX 5090 (FP4 model).
#
# Usage (on the instance):
#   PLN_GPU_TOKEN=... \
#   HF_TOKEN=... \
#   TUNNEL_NAME=flux-vast-NN \
#   bash setup-vast.sh
#
# Optional env:
#   HF_TOKEN          REQUIRED in practice: black-forest-labs/FLUX.1-schnell is
#                     gated (accept-terms); token must belong to an account
#                     that accepted. Lives in enter.pollinations.ai/.testingtokens
#   QUANT_MODEL_PATH  default mit-han-lab/svdq-fp4-flux.1-schnell (Blackwell);
#                     use mit-han-lab/svdq-int4-flux.1-schnell on Ada GPUs
#   MAX_PIXELS        default 1048576 (1024x1024, matches FP4/5090);
#                     use 810000 on RTX 4090
#   QUEUE_LIMIT       default 10 (server.py sheds load with 503 beyond this;
#                     gateway then falls back to Fireworks)
#   PUBLIC_IP/PUBLIC_PORT  only for tunnel-less setups (no TUNNEL_NAME)
#   SERVICE_TYPE      default flux
#   GIT_BRANCH        default main
#   SKIP_CLONE        use files already in $WORK_DIR (hosts w/ broken GitHub egress)
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

if [ -z "$PLN_GPU_TOKEN" ] || { [ -z "$TUNNEL_NAME" ] && [ -z "$PUBLIC_PORT" ]; }; then
    echo "Usage: PLN_GPU_TOKEN=... TUNNEL_NAME=flux-vast-NN bash setup-vast.sh" >&2
    exit 1
fi

log "Installing system packages..."
$SUDO apt-get update -qq
$SUDO apt-get install -y -qq git screen python3.12-venv python3.12-dev

# CUDA forward-compat libs (shipped in cuda-13 images) fail on GeForce when the
# host driver is older than the toolkit (CUDA Error 804) — always use the host
# driver instead.
if ls /usr/local/cuda*/compat/libcuda.so* >/dev/null 2>&1; then
    log "Disabling CUDA forward-compat libs (using host driver)..."
    mkdir -p /root/cuda-compat-disabled
    mv /usr/local/cuda*/compat/libcuda.so* /root/cuda-compat-disabled/
    $SUDO ldconfig
fi

if [ -n "$TUNNEL_NAME" ]; then
    if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
        echo "TUNNEL_NAME set but $HOME/.cloudflared/cert.pem missing (pollinations.ai account cert)" >&2
        exit 1
    fi
    if ! command -v cloudflared >/dev/null; then
        log "Installing cloudflared..."
        curl -sL --retry 5 -o /tmp/cloudflared.deb \
            https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        $SUDO dpkg -i /tmp/cloudflared.deb >/dev/null
    fi
    log "Creating tunnel $TUNNEL_NAME → $TUNNEL_NAME.pollinations.ai..."
    cloudflared tunnel create "$TUNNEL_NAME" 2>&1 | tail -1 || true
    cloudflared tunnel route dns --overwrite-dns "$TUNNEL_NAME" "$TUNNEL_NAME.pollinations.ai" 2>&1 | tail -1
    TID=$(cloudflared tunnel list -o json | python3 -c "import json,sys; print([t['id'] for t in json.load(sys.stdin) if t['name']=='$TUNNEL_NAME'][0])")
    cat > "$HOME/.cloudflared/config.yml" <<CFG
tunnel: $TID
credentials-file: $HOME/.cloudflared/$TID.json
ingress:
  - hostname: $TUNNEL_NAME.pollinations.ai
    service: http://localhost:$PORT
  - service: http_status:404
CFG
    screen -S cloudflared -X quit 2>/dev/null || true
    screen -dmS cloudflared bash -c "while true; do cloudflared tunnel run $TUNNEL_NAME 2>&1 | tee -a /tmp/cloudflared.log; sleep 5; done"
    PUBLIC_IP="$TUNNEL_NAME.pollinations.ai"
    PUBLIC_PORT=443
fi

# Some Vast hosts have unreliable egress to GitHub; SKIP_CLONE=1 uses files
# already placed in $WORK_DIR (e.g. scp'd from the operator's machine).
if [ -n "$SKIP_CLONE" ]; then
    log "SKIP_CLONE set — using existing files in $WORK_DIR"
elif [ -d "$WORK_DIR" ]; then
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

# Some vast hosts drop bulk CDN connections mid-download; --resume-retries
# (pip >= 25.1) resumes partial wheel downloads instead of restarting them.
PIP_FLAGS="--resume-retries 20 --timeout 60 --retries 10"

log "Installing PyTorch 2.9.1 cu128 (matches prebuilt nunchaku wheel)..."
pip install -q $PIP_FLAGS torch==2.9.1 torchvision==0.24.1 --index-url https://download.pytorch.org/whl/cu128

log "Installing requirements..."
pip install -q $PIP_FLAGS -r requirements.txt

log "Installing prebuilt nunchaku wheel (SM 7.5/8.0/8.6/8.9/120)..."
pip install -q $PIP_FLAGS --no-cache-dir --no-deps \
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
export QUEUE_LIMIT=${QUEUE_LIMIT:-10}
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
