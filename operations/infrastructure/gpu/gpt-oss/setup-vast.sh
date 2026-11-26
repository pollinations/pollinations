#!/bin/bash
# Serve openai/gpt-oss-20b with vLLM on a single-GPU Vast.ai instance.
#
# Rent the instance with the image vllm/vllm-openai:v0.34.0, the version
# benchmarked on an RTX 4090 in Nov 2026 (~9 requests/s at most, p95 5.2s at
# 4 requests/s). Vast instances have no systemd, so vLLM, the nginx capacity
# gate (nginx.conf) and a remotely managed Cloudflare Tunnel run in screen
# restart loops.
#
# The tunnel's public hostname (gpt-oss-vast.myceli.ai, which gen calls) must
# point at http://localhost:10010. Keep the tunnel stopped for local
# validation: once it runs, the instance receives production traffic.
#
# Usage:
#   PLN_GPU_TOKEN=... CLOUDFLARED_TUNNEL_TOKEN=... bash setup-vast.sh

set -euo pipefail

GIT_BRANCH="${GIT_BRANCH:-main}"
WORK_DIR="${WORK_DIR:-/workspace/pollinations}"
MODEL_CACHE="${MODEL_CACHE:-/workspace/hf-cache}"

log() { echo "[setup-vast] $1"; }

if [ -z "${PLN_GPU_TOKEN:-}" ] || [ -z "${CLOUDFLARED_TUNNEL_TOKEN:-}" ]; then
    echo "Usage: PLN_GPU_TOKEN=... CLOUDFLARED_TUNNEL_TOKEN=... bash setup-vast.sh" >&2
    exit 1
fi

log "Installing system packages"
apt-get update -qq
apt-get install -y -qq curl git nginx screen

TUNNEL_TOKEN_FILE="$HOME/.cloudflared/tunnel-token"
TUNNEL_ENABLED_FILE="$HOME/.cloudflared/tunnel-enabled"
install -d -m 700 "$HOME/.cloudflared"
printf '%s' "$CLOUDFLARED_TUNNEL_TOKEN" > "$TUNNEL_TOKEN_FILE"
chmod 600 "$TUNNEL_TOKEN_FILE"
unset CLOUDFLARED_TUNNEL_TOKEN

# vLLM rejects requests without this key; gen sends it as a bearer token
install -m 600 /dev/null /root/gpu-token
printf '%s' "$PLN_GPU_TOKEN" > /root/gpu-token
unset PLN_GPU_TOKEN

mkdir -p "$(dirname "$WORK_DIR")" "$MODEL_CACHE"
if [ -d "$WORK_DIR/.git" ]; then
    log "Updating repository to $GIT_BRANCH"
    git -C "$WORK_DIR" fetch --depth 1 origin "$GIT_BRANCH"
    git -C "$WORK_DIR" checkout FETCH_HEAD
else
    log "Cloning repository branch $GIT_BRANCH"
    git clone --depth 1 --branch "$GIT_BRANCH" \
        https://github.com/pollinations/pollinations.git "$WORK_DIR"
fi

GPU_DIR="$WORK_DIR/operations/infrastructure/gpu"
bash "$GPU_DIR/install-cloudflared.sh"
install -m 700 "$GPU_DIR/watch-tunnel.sh" /root/watch-tunnel.sh

# --max-num-seqs 32: requests vLLM runs at once; nginx admits 48, so 16 wait.
# --enable-force-include-usage: gen bills only replies that report usage.
cat > /root/run-vllm.sh <<EOF
#!/bin/bash
export HF_HOME="$MODEL_CACHE"
exec vllm serve openai/gpt-oss-20b \\
    --served-model-name openai/gpt-oss-20b \\
    --host 127.0.0.1 --port 8000 \\
    --api-key "\$(cat /root/gpu-token)" \\
    --max-model-len 131072 \\
    --max-num-seqs 32 \\
    --gpu-memory-utilization 0.92 \\
    --enable-force-include-usage
EOF
chmod 700 /root/run-vllm.sh

cat > /root/onstart.sh <<EOF
#!/bin/bash
set -euo pipefail

for session in vllm nginx cloudflared cloudflared-watchdog; do
    screen -S "\$session" -X quit 2>/dev/null || true
done

screen -dmS vllm bash -c 'while true; do /root/run-vllm.sh >> /root/vllm.log 2>&1; sleep 5; done'
screen -dmS nginx bash -c 'while true; do nginx -c "$GPU_DIR/gpt-oss/nginx.conf" -g "daemon off;" >> /root/nginx.log 2>&1; sleep 5; done'

if [ ! -f "$TUNNEL_ENABLED_FILE" ]; then
    echo "Production tunnel is disabled; create $TUNNEL_ENABLED_FILE after local validation"
    exit 0
fi

screen -dmS cloudflared bash -c 'until curl -fsS --max-time 3 http://127.0.0.1:10010/health >/dev/null; do echo "Waiting for vLLM health before joining the tunnel" >> /root/cloudflared.log; sleep 5; done; while true; do cloudflared tunnel --no-autoupdate --metrics 127.0.0.1:20241 run --token-file "$TUNNEL_TOKEN_FILE" >> /root/cloudflared.log 2>&1; sleep 5; done'
screen -dmS cloudflared-watchdog bash /root/watch-tunnel.sh 127.0.0.1:20241 /root/cloudflared.log
EOF
chmod 700 /root/onstart.sh

/root/onstart.sh

log "vLLM is starting; logs: tail -f /root/vllm.log"
if [ -f "$TUNNEL_ENABLED_FILE" ]; then
    log "The tunnel waits for local health, then serves production traffic"
else
    log "Tunnel disabled. Validate with verify-vast.sh, then:"
    log "  touch $TUNNEL_ENABLED_FILE && /root/onstart.sh"
fi
