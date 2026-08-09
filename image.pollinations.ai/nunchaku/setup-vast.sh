#!/bin/bash
# Flux Schnell worker setup for a Vast.ai instance (single GPU).
#
# Vast instances are docker containers (root, no systemd), so this installs
# into a venv and runs server.py inside a screen session with a restart loop
# (server.py exits on CUDA errors and expects its supervisor to restart it).
#
# IMPORTANT — Cloudflare Tunnel required: the gen worker (Cloudflare Worker)
# cannot fetch() raw-IP/non-standard-port origins. Create a remotely-managed
# tunnel and its public hostname in the authoritative Cloudflare account before
# running this script. The Vast host only receives the scoped tunnel token; do
# not copy a Cloudflare account certificate onto a rental host.
#
# Tested against vastai/base-image:cuda-13.0.2-cudnn-devel-ubuntu24.04-py312.
# The prebuilt nunchaku wheel bundles SM 7.5/8.0/8.6/8.9/120 kernels, so the
# same setup works on RTX 4090 (INT4 model) and RTX 5090 (FP4 model).
#
# Usage (on the instance):
#   PLN_GPU_TOKEN=... \
#   HF_TOKEN=... \
#   PUBLIC_HOSTNAME=flux-vast-NN.pollinations.ai \
#   bash setup-vast.sh
#
# This defaults to an isolated canary: no registry heartbeat and no production
# tunnel. After verification and human approval, provide the scoped tunnel
# token, set HEARTBEAT_ENABLED=true and TUNNEL_ENABLED=true, then rerun setup.
#
# Required env details:
#   HF_TOKEN          black-forest-labs/FLUX.1-schnell is gated (accept-terms);
#                     token must belong to an account that accepted. Lives in
#                     enter.pollinations.ai/.testingtokens
#
# Optional env:
#   QUANT_MODEL_PATH  default mit-han-lab/svdq-fp4-flux.1-schnell (Blackwell);
#                     use mit-han-lab/svdq-int4-flux.1-schnell on Ada GPUs
#   MAX_PIXELS        default 1048576 (1024x1024, matches FP4/5090);
#                     use 810000 on RTX 4090
#   QUEUE_LIMIT       default 3 (intended as one running plus two waiting;
#                     synchronous inference currently prevents this from being
#                     a reliable hard cap — see GPU_INSTANCES.md)
#   SERVICE_TYPE      default flux
#   HEARTBEAT_ENABLED default false; enable only for an approved production worker
#   TUNNEL_ENABLED    default false; enable only after human promotion approval
#   HF_HUB_DISABLE_XET default 1; standard HTTP is more reliable on Vast hosts
#   GIT_BRANCH        default main
#   SKIP_CLONE        use files already in $WORK_DIR (hosts w/ broken GitHub egress)
#   WORK_DIR          default /workspace/pollinations

set -e

GIT_BRANCH="${GIT_BRANCH:-main}"
WORK_DIR="${WORK_DIR:-/workspace/pollinations}"
QUANT_MODEL_PATH="${QUANT_MODEL_PATH:-mit-han-lab/svdq-fp4-flux.1-schnell}"
MAX_PIXELS="${MAX_PIXELS:-1048576}"
SERVICE_TYPE="${SERVICE_TYPE:-flux}"
HEARTBEAT_ENABLED="${HEARTBEAT_ENABLED:-false}"
TUNNEL_ENABLED="${TUNNEL_ENABLED:-false}"
HF_HUB_DISABLE_XET="${HF_HUB_DISABLE_XET:-1}"
PUBLIC_HOSTNAME="${PUBLIC_HOSTNAME:-localhost}"
PORT="${PORT:-8765}"
SUDO=""
[ "$(id -u)" != "0" ] && SUDO="sudo"

log() { echo -e "\033[0;32m[setup-vast]\033[0m $1"; }

if [ -z "${PLN_GPU_TOKEN:-}" ] || [ -z "${HF_TOKEN:-}" ]; then
    echo "Usage: PLN_GPU_TOKEN=... HF_TOKEN=... PUBLIC_HOSTNAME=flux-vast-NN.pollinations.ai bash setup-vast.sh" >&2
    exit 1
fi

if [ "$TUNNEL_ENABLED" = true ] && { [ -z "${CLOUDFLARED_TUNNEL_TOKEN:-}" ] || [ "$PUBLIC_HOSTNAME" = localhost ]; }; then
    echo "TUNNEL_ENABLED=true requires CLOUDFLARED_TUNNEL_TOKEN and PUBLIC_HOSTNAME" >&2
    exit 1
fi

case "$PUBLIC_HOSTNAME" in
    *[!A-Za-z0-9.-]*)
        echo "PUBLIC_HOSTNAME must be a hostname, without a scheme or path" >&2
        exit 1
        ;;
esac

log "Installing system packages..."
$SUDO apt-get update -qq
$SUDO apt-get install -y -qq curl dnsutils git screen python3.12-venv python3.12-dev

# CUDA forward-compat libs (shipped in cuda-13 images) fail on GeForce when the
# host driver is older than the toolkit (CUDA Error 804) — always use the host
# driver instead.
if find /usr/local -maxdepth 3 -path '/usr/local/cuda-*/compat/libcuda.so*' -print -quit 2>/dev/null | grep -q .; then
    log "Disabling CUDA forward-compat libs (using host driver)..."
    mkdir -p /root/cuda-compat-disabled
    find /usr/local -maxdepth 3 -path '/usr/local/cuda-*/compat/libcuda.so*' \
        -exec mv -t /root/cuda-compat-disabled/ {} +
    $SUDO ldconfig
fi

if ! command -v cloudflared >/dev/null || \
    ! cloudflared tunnel run --help 2>&1 | grep -q -- '--token-file'; then
    log "Installing cloudflared..."
    curl -fsSL --retry 5 -o /tmp/cloudflared.deb \
        https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    $SUDO dpkg -i /tmp/cloudflared.deb >/dev/null
fi

# token-file keeps the remotely-managed tunnel token out of process listings.
# It requires cloudflared 2025.4.0 or newer; fresh hosts install latest above.
TUNNEL_TOKEN_FILE="$HOME/.cloudflared/tunnel-token"
TUNNEL_ENABLED_FILE="$HOME/.cloudflared/tunnel-enabled"
TUNNEL_DNS_FALLBACK_MARKER="$HOME/.cloudflared/use-local-doh"
TUNNEL_RESOLV_BACKUP="/etc/resolv.conf.vast-original"
TUNNEL_SRV_NAME="_v2-origintunneld._tcp.argotunnel.com"
install -d -m 700 "$HOME/.cloudflared"
if [ -n "${CLOUDFLARED_TUNNEL_TOKEN:-}" ]; then
    printf '%s' "$CLOUDFLARED_TUNNEL_TOKEN" > "$TUNNEL_TOKEN_FILE"
    chmod 600 "$TUNNEL_TOKEN_FILE"
    unset CLOUDFLARED_TUNNEL_TOKEN
fi

if [ "$TUNNEL_ENABLED" = true ]; then
    touch "$TUNNEL_ENABLED_FILE"
else
    rm -f "$TUNNEL_ENABLED_FILE"
fi

# A small subset of Vast hosts resolves A records but drops the SRV responses
# cloudflared needs. Mark those hosts once so every reboot starts a local DoH
# resolver before the tunnel. Hosts with working SRV DNS keep their resolver.
if [ -f "$TUNNEL_DNS_FALLBACK_MARKER" ]; then
    log "Reusing the local DoH fallback selected on this host"
elif ! dig +time=3 +tries=1 +short SRV "$TUNNEL_SRV_NAME" | grep -q argotunnel.com; then
    log "Vast DNS does not return Cloudflare Tunnel SRV records; enabling local DoH"
    [ -s "$TUNNEL_RESOLV_BACKUP" ] || cp /etc/resolv.conf "$TUNNEL_RESOLV_BACKUP"
    touch "$TUNNEL_DNS_FALLBACK_MARKER"
fi

PUBLIC_IP="$PUBLIC_HOSTNAME"
if [ "$PUBLIC_HOSTNAME" = localhost ]; then
    PUBLIC_PORT="$PORT"
else
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
{
    printf 'export HF_TOKEN=%q\n' "$HF_TOKEN"
    printf 'export PLN_GPU_TOKEN=%q\n' "$PLN_GPU_TOKEN"
    printf 'export PORT=%q\n' "$PORT"
    printf 'export PUBLIC_PORT=%q\n' "$PUBLIC_PORT"
    printf 'export PUBLIC_IP=%q\n' "$PUBLIC_IP"
    printf 'export SERVICE_TYPE=%q\n' "$SERVICE_TYPE"
    printf 'export HEARTBEAT_ENABLED=%q\n' "$HEARTBEAT_ENABLED"
    printf 'export QUANT_MODEL_PATH=%q\n' "$QUANT_MODEL_PATH"
    printf 'export MAX_PIXELS=%q\n' "$MAX_PIXELS"
    printf 'export QUEUE_LIMIT=%q\n' "${QUEUE_LIMIT:-3}"
    printf 'export CUDA_VISIBLE_DEVICES=%q\n' "${CUDA_VISIBLE_DEVICES:-0}"
    printf 'export HF_HUB_DISABLE_XET=%q\n' "$HF_HUB_DISABLE_XET"
} > "$NUNCHAKU_DIR/.env.flux"
chmod 600 "$NUNCHAKU_DIR/.env.flux"

cat > /root/run-flux.sh <<EOF
#!/bin/bash
cd "$NUNCHAKU_DIR"
source venv/bin/activate
source .env.flux
exec python server.py
EOF

cat > /root/onstart.sh <<EOF
#!/bin/bash
set -euo pipefail

screen -S flux -X quit 2>/dev/null || true
screen -S cloudflared -X quit 2>/dev/null || true
screen -S tunnel-dns -X quit 2>/dev/null || true

screen -dmS flux bash -c 'while true; do /root/run-flux.sh 2>&1 | tee -a /tmp/flux.log; echo "[setup-vast] server exited, restarting in 5s" | tee -a /tmp/flux.log; sleep 5; done'

if [ ! -f "$TUNNEL_ENABLED_FILE" ]; then
    echo "Production tunnel disabled; verify locally before promotion"
    exit 0
fi

if [ ! -s "$TUNNEL_TOKEN_FILE" ]; then
    echo "Production tunnel enabled but token file is missing" >> /tmp/cloudflared.log
    exit 1
fi

if [ -f "$TUNNEL_DNS_FALLBACK_MARKER" ]; then
    screen -dmS tunnel-dns bash -c 'while true; do cloudflared proxy-dns --address 127.0.0.1 --port 53 --upstream https://cloudflare-dns.com/dns-query --bootstrap https://162.159.36.1/dns-query --bootstrap https://162.159.46.1/dns-query >> /tmp/tunnel-dns.log 2>&1; sleep 5; done'

    tunnel_dns_ready=false
    for _ in \$(seq 1 20); do
        if dig @127.0.0.1 +time=2 +tries=1 +short SRV "$TUNNEL_SRV_NAME" | grep -q argotunnel.com; then
            {
                printf 'nameserver 127.0.0.1\n'
                grep -v '^nameserver ' "$TUNNEL_RESOLV_BACKUP" || true
            } > /etc/resolv.conf
            tunnel_dns_ready=true
            break
        fi
        sleep 1
    done

    if [ "\$tunnel_dns_ready" != true ]; then
        echo "Local DoH did not become ready; production tunnel remains stopped" >> /tmp/tunnel-dns.log
        exit 1
    fi
fi

screen -dmS cloudflared bash -c 'until curl -fsS --max-time 3 http://127.0.0.1:$PORT/docs >/dev/null; do echo "Waiting for Flux health before joining the production tunnel" >> /tmp/cloudflared.log; sleep 3; done; while true; do cloudflared tunnel --no-autoupdate run --token-file "$TUNNEL_TOKEN_FILE" >> /tmp/cloudflared.log 2>&1; sleep 5; done'
EOF
chmod 700 /root/run-flux.sh /root/onstart.sh

log "Starting durable Flux service (logs: /tmp/flux.log, /tmp/cloudflared.log)..."
/root/onstart.sh

log "Done. Model load takes 2-3 min on first start."
log "  Logs:       tail -f /tmp/flux.log"
log "  Attach:     screen -r flux   (detach: Ctrl+A, D)"
log "  Local test: curl -s localhost:$PORT/docs >/dev/null && echo up"
log "  Canary:     POLLINATIONS_API_KEY=... bash verify-vast.sh"
if [ "$TUNNEL_ENABLED" = true ]; then
    log "  Registered: curl -s https://gen.pollinations.ai/register | grep -o '$SERVICE_TYPE[^,]*'"
else
    log "  Production heartbeat and tunnel are disabled pending human approval"
fi
