#!/bin/bash
# Provision FLUX.2 Klein on a single-GPU Vast SSH instance.
#
# Create a remotely managed Cloudflare Tunnel first. The gen Worker binds to
# that tunnel through Workers VPC, so this host only needs the scoped tunnel
# token; never copy a Cloudflare account certificate onto a rental host.
#
# Tested with pytorch/pytorch:2.5.1-cuda12.1-cudnn9-devel on an RTX 3090.
#
# Usage:
#   PLN_GPU_TOKEN=... \
#   CLOUDFLARED_TUNNEL_TOKEN=... \
#   bash setup-vast.sh
#
# This defaults to an isolated canary. Set TUNNEL_ENABLED=true only after the
# worker passes direct tests and receives explicit human promotion approval.
# Rerun this setup for promotion; manually creating the tunnel marker bypasses
# the required Workers VPC QUIC qualification below.

set -e

WORK_DIR="${WORK_DIR:-/workspace/pollinations}"
GIT_BRANCH="${GIT_BRANCH:-main}"
VENV="${VENV:-/workspace/klein-venv}"
CACHE_DIR="${CACHE_DIR:-/workspace/hf-cache}"
TUNNEL_ENABLED="${TUNNEL_ENABLED:-false}"
TUNNEL_TOKEN_FILE="/root/.cloudflared_token"
TUNNEL_ENABLED_FILE="/root/.cloudflared_tunnel_enabled"
CLOUDFLARED_MIN_VERSION="2026.5.2"
CLOUDFLARED_METRICS="127.0.0.1:20241"

if [ -z "${PLN_GPU_TOKEN:-}" ]; then
    echo "Usage: PLN_GPU_TOKEN=... bash setup-vast.sh" >&2
    exit 1
fi

if [ "$TUNNEL_ENABLED" = true ] && \
    [ -z "${CLOUDFLARED_TUNNEL_TOKEN:-}" ] && \
    [ ! -s "$TUNNEL_TOKEN_FILE" ]; then
    echo "TUNNEL_ENABLED=true requires CLOUDFLARED_TUNNEL_TOKEN" >&2
    exit 1
fi

apt-get update -qq
apt-get install -y -qq curl git screen python3-venv

cloudflared_version=""
if command -v cloudflared >/dev/null; then
    cloudflared_version=$(cloudflared --version 2>/dev/null | awk '{print $3}')
fi
if [ -z "$cloudflared_version" ] || \
    ! dpkg --compare-versions "$cloudflared_version" ge "$CLOUDFLARED_MIN_VERSION"; then
    curl -fsSL --retry 5 -o /tmp/cloudflared.deb \
        https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    dpkg -i /tmp/cloudflared.deb >/dev/null
fi

if [ -n "$SKIP_CLONE" ]; then
    :
elif [ -d "$WORK_DIR/.git" ]; then
    git -C "$WORK_DIR" fetch --depth 1 origin "$GIT_BRANCH"
    git -C "$WORK_DIR" checkout FETCH_HEAD
else
    git clone --depth 1 --branch "$GIT_BRANCH" \
        https://github.com/pollinations/pollinations.git "$WORK_DIR"
fi

KLEIN_DIR="$WORK_DIR/operations/infrastructure/gpu/klein"
mkdir -p "$CACHE_DIR"

if [ ! -d "$VENV" ]; then
    python -m venv --system-site-packages "$VENV"
fi
"$VENV/bin/pip" install --upgrade -q pip
"$VENV/bin/pip" install -q --resume-retries 20 --timeout 60 --retries 10 \
    -r "$KLEIN_DIR/requirements.txt"

printf '%s' "$PLN_GPU_TOKEN" > /root/.pln_gpu_token
if [ -n "${CLOUDFLARED_TUNNEL_TOKEN:-}" ]; then
    printf '%s' "$CLOUDFLARED_TUNNEL_TOKEN" > "$TUNNEL_TOKEN_FILE"
fi
chmod 600 /root/.pln_gpu_token
if [ -f "$TUNNEL_TOKEN_FILE" ]; then
    chmod 600 "$TUNNEL_TOKEN_FILE"
fi
unset PLN_GPU_TOKEN CLOUDFLARED_TUNNEL_TOKEN

if [ "$TUNNEL_ENABLED" = true ]; then
    touch "$TUNNEL_ENABLED_FILE"
else
    rm -f "$TUNNEL_ENABLED_FILE"
fi

cat > /root/run-klein.sh <<EOF
#!/bin/bash
export PLN_GPU_TOKEN="\$(cat /root/.pln_gpu_token)"
export HF_HUB_CACHE="$CACHE_DIR"
export HF_XET_HIGH_PERFORMANCE=1
cd "$KLEIN_DIR"
exec "$VENV/bin/python" -u handler.py
EOF

cat > /root/onstart.sh <<'EOF'
#!/bin/bash
screen -S klein -X quit 2>/dev/null || true
screen -S cloudflared -X quit 2>/dev/null || true
screen -dmS klein bash -c 'while true; do /root/run-klein.sh >> /root/klein.log 2>&1; sleep 5; done'

if [ ! -f /root/.cloudflared_tunnel_enabled ]; then
    echo "Production tunnel disabled; verify Klein locally before promotion"
    exit 0
fi

if [ ! -s /root/.cloudflared_token ]; then
    echo "Production tunnel enabled but token file is missing" >> /root/cloudflared.log
    exit 1
fi

screen -dmS cloudflared bash -c 'until curl -fsS --max-time 3 http://127.0.0.1:8000/health >/dev/null; do echo "Waiting for Klein health before joining the production tunnel" >> /root/cloudflared.log; sleep 3; done; while true; do cloudflared tunnel --no-autoupdate --protocol quic --metrics 127.0.0.1:20241 run --token-file /root/.cloudflared_token >> /root/cloudflared.log 2>&1; sleep 5; done'
EOF
chmod 700 /root/run-klein.sh /root/onstart.sh

TUNNEL_LOG_START=0
if [ -f /root/cloudflared.log ]; then
    TUNNEL_LOG_START=$(wc -l < /root/cloudflared.log)
fi
/root/onstart.sh

echo "Klein is starting. Follow logs with: tail -f /root/klein.log"
if [ "$TUNNEL_ENABLED" = true ]; then
    tunnel_ready=false
    reject_tunnel() {
        screen -S cloudflared -X quit 2>/dev/null || true
        rm -f "$TUNNEL_ENABLED_FILE"
        echo "$1" >&2
        echo "Tunnel stopped and disabled; do not promote this host" >&2
        exit 1
    }

    for _ in $(seq 1 30); do
        current_log=$(tail -n "+$((TUNNEL_LOG_START + 1))" /root/cloudflared.log 2>/dev/null || true)
        if printf '%s\n' "$current_log" | grep -Eq 'UDP Connectivity.*FAIL'; then
            reject_tunnel "Klein Workers VPC requires QUIC, but the UDP/7844 precheck failed"
        fi

        metrics=$(curl -fsS --max-time 2 "http://$CLOUDFLARED_METRICS/metrics" 2>/dev/null || true)
        connections=$(printf '%s\n' "$metrics" | awk '$1 == "cloudflared_tunnel_ha_connections" {print $2; exit}')
        request_errors=$(printf '%s\n' "$metrics" | awk '$1 == "cloudflared_tunnel_request_errors" {print $2; exit}')
        if [ "$connections" = "4" ] && [ "${request_errors:-0}" = "0" ]; then
            tunnel_ready=true
            break
        fi
        sleep 2
    done

    if [ "$tunnel_ready" != true ]; then
        reject_tunnel "Klein tunnel did not reach four healthy QUIC connections within 60 seconds"
    fi
    echo "Klein QUIC preflight passed: four connections, zero request errors."
else
    echo "Production tunnel disabled pending direct tests and human approval."
fi
