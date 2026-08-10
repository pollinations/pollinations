#!/bin/bash
set -euo pipefail

: "${PLN_GPU_TOKEN:?PLN_GPU_TOKEN is required}"

GIT_BRANCH="${GIT_BRANCH:-main}"
WORK_DIR="${WORK_DIR:-/workspace/pollinations}"
VENV="${VENV:-/workspace/dreamshaper-venv}"
APP_DIR="$WORK_DIR/operations/infrastructure/gpu/dreamshaper"
PUBLIC_HOSTNAME="${PUBLIC_HOSTNAME:-}"
PORT="${PORT:-8766}"
HEARTBEAT_ENABLED="${HEARTBEAT_ENABLED:-false}"
TUNNEL_ENABLED="${TUNNEL_ENABLED:-false}"
QUEUE_LIMIT="${QUEUE_LIMIT:-2}"

if [ "$HEARTBEAT_ENABLED" = true ] && [ -z "$PUBLIC_HOSTNAME" ]; then
    echo "PUBLIC_HOSTNAME is required when HEARTBEAT_ENABLED=true" >&2
    exit 1
fi
if [ "$TUNNEL_ENABLED" = true ]; then
    : "${CLOUDFLARED_TUNNEL_TOKEN:?CLOUDFLARED_TUNNEL_TOKEN is required when TUNNEL_ENABLED=true}"
    if [ -z "$PUBLIC_HOSTNAME" ]; then
        echo "PUBLIC_HOSTNAME is required when TUNNEL_ENABLED=true" >&2
        exit 1
    fi
fi

apt-get update -qq
apt-get install -y -qq curl dnsutils git psmisc screen python3.12-venv python3.12-dev

if ! command -v cloudflared >/dev/null || \
    ! cloudflared tunnel run --help 2>&1 | grep -q -- '--token-file'; then
    curl -fsSL --retry 5 -o /tmp/cloudflared.deb \
        https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    dpkg -i /tmp/cloudflared.deb >/dev/null
fi

if [ -d "$WORK_DIR/.git" ]; then
    git -C "$WORK_DIR" fetch --depth 1 origin "$GIT_BRANCH"
    git -C "$WORK_DIR" checkout FETCH_HEAD
else
    git clone --depth 1 --branch "$GIT_BRANCH" \
        https://github.com/pollinations/pollinations.git "$WORK_DIR"
fi

if [ ! -d "$VENV" ]; then
    python3.12 -m venv "$VENV"
fi

PIP_FLAGS="--resume-retries 20 --timeout 60 --retries 10"
"$VENV/bin/pip" install --upgrade -q pip
"$VENV/bin/pip" install -q $PIP_FLAGS torch==2.8.0 torchvision==0.23.0 \
    --index-url https://download.pytorch.org/whl/cu128
"$VENV/bin/pip" install -q $PIP_FLAGS -r "$APP_DIR/requirements.txt"

"$VENV/bin/python" - <<'PY'
import torch

assert torch.cuda.is_available(), "CUDA is not available"
assert torch.version.cuda == "12.8", f"Expected CUDA 12.8, got {torch.version.cuda}"
print("CUDA OK:", torch.__version__, torch.version.cuda, torch.cuda.get_device_name(0))
PY

cat > "$APP_DIR/.env.dreamshaper" <<EOF
export PLN_GPU_TOKEN=$(printf %q "$PLN_GPU_TOKEN")
export PUBLIC_HOSTNAME=$(printf %q "$PUBLIC_HOSTNAME")
export PORT=$(printf %q "$PORT")
export SERVICE_TYPE=sana
export HEARTBEAT_ENABLED=$(printf %q "$HEARTBEAT_ENABLED")
export NUM_INFERENCE_STEPS=3
export GUIDANCE_SCALE=0.0
export WORKERS=3
export QUEUE_LIMIT=$(printf %q "$QUEUE_LIMIT")
export CUDA_VISIBLE_DEVICES=0
export HF_HUB_DISABLE_PROGRESS_BARS=1
export TQDM_DISABLE=1
EOF
chmod 600 "$APP_DIR/.env.dreamshaper"
unset PLN_GPU_TOKEN

install -d -m 700 /root/.cloudflared
if [ "$TUNNEL_ENABLED" = true ]; then
    printf '%s' "$CLOUDFLARED_TUNNEL_TOKEN" > /root/.cloudflared/tunnel-token
    chmod 600 /root/.cloudflared/tunnel-token
    touch /root/.cloudflared/tunnel-enabled
else
    rm -f /root/.cloudflared/tunnel-enabled
fi
unset CLOUDFLARED_TUNNEL_TOKEN || true

cat > /root/run-dreamshaper.sh <<EOF
#!/bin/bash
set -a
source "$APP_DIR/.env.dreamshaper"
set +a
cd "$APP_DIR"
exec "$VENV/bin/python" -u server.py
EOF
chmod 700 /root/run-dreamshaper.sh

cat > /root/onstart.sh <<EOF
#!/bin/bash
set -euo pipefail
PORT=$PORT

screen -wipe >/dev/null 2>&1 || true
screen -S dreamshaper -X quit 2>/dev/null || true
screen -S cloudflared -X quit 2>/dev/null || true
fuser -k -TERM \"\$PORT/tcp\" >/dev/null 2>&1 || true
for _ in 1 2 3 4 5; do
    if ! fuser \"\$PORT/tcp\" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done
fuser -k -KILL \"\$PORT/tcp\" >/dev/null 2>&1 || true

screen -dmS dreamshaper bash -c 'while true; do /root/run-dreamshaper.sh >> /root/dreamshaper.log 2>&1; sleep 5; done'
if [ ! -f /root/.cloudflared/tunnel-enabled ]; then
    exit 0
fi
screen -dmS cloudflared bash -c 'until curl -fsS --max-time 3 http://127.0.0.1:$PORT/health >/dev/null; do sleep 5; done; while true; do cloudflared tunnel --no-autoupdate run --token-file /root/.cloudflared/tunnel-token >> /root/cloudflared.log 2>&1; sleep 5; done'
EOF
chmod 700 /root/onstart.sh

/root/onstart.sh
echo "DreamShaper started (heartbeat=$HEARTBEAT_ENABLED, tunnel=$TUNNEL_ENABLED)"
