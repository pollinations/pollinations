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

set -e

WORK_DIR="${WORK_DIR:-/workspace/pollinations}"
GIT_BRANCH="${GIT_BRANCH:-main}"
VENV="${VENV:-/workspace/klein-venv}"
CACHE_DIR="${CACHE_DIR:-/workspace/hf-cache}"

if [ -z "$PLN_GPU_TOKEN" ] || [ -z "$CLOUDFLARED_TUNNEL_TOKEN" ]; then
    echo "Usage: PLN_GPU_TOKEN=... CLOUDFLARED_TUNNEL_TOKEN=... bash setup-vast.sh" >&2
    exit 1
fi

apt-get update -qq
apt-get install -y -qq curl git screen python3-venv

if ! command -v cloudflared >/dev/null || \
    ! cloudflared tunnel run --help 2>&1 | grep -q -- '--token-file'; then
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

KLEIN_DIR="$WORK_DIR/image.pollinations.ai/klein-runpod"
mkdir -p "$CACHE_DIR"

if [ ! -d "$VENV" ]; then
    python -m venv --system-site-packages "$VENV"
fi
"$VENV/bin/pip" install --upgrade -q pip
"$VENV/bin/pip" install -q --resume-retries 20 --timeout 60 --retries 10 \
    -r "$KLEIN_DIR/requirements.txt"

printf '%s' "$PLN_GPU_TOKEN" > /root/.pln_gpu_token
printf '%s' "$CLOUDFLARED_TUNNEL_TOKEN" > /root/.cloudflared_token
chmod 600 /root/.pln_gpu_token /root/.cloudflared_token
unset PLN_GPU_TOKEN CLOUDFLARED_TUNNEL_TOKEN

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
screen -dmS cloudflared bash -c 'while true; do cloudflared tunnel --no-autoupdate run --token-file /root/.cloudflared_token >> /root/cloudflared.log 2>&1; sleep 5; done'
EOF
chmod 700 /root/run-klein.sh /root/onstart.sh

/root/onstart.sh

echo "Klein is starting. Follow logs with: tail -f /root/klein.log"
