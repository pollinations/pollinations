#!/bin/bash
# Rotate PLN_GPU_TOKEN — the token the EC2 image service uses to
# authenticate requests to GPU worker instances (Flux, Z-Image, Klein, LTX-2).
#
# Usage: ./rotate-pln-gpu-token.sh [--dry-run] [NEW_TOKEN]
#
# Trust boundary: EC2 image service → GPU workers (RunPod, Lambda Labs)
#
# This script:
# 1. Writes the new token into the SOPS-encrypted image secrets file
# 2. Updates the token on each GPU worker via SSH ($HOME/.env + restart)
#
# GPU workers validate the token via the x-backend-token HTTP header.
# After running, commit the SOPS change and deploy EC2 to pick up the new env.
#
# Prerequisites:
# - sops configured and working
# - SSH access to GPU instances (keys in ~/.ssh/thomashkey, ~/.runpod/ssh/RunPod-Key-Go)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

DRY_RUN=false

# Parse flags
while [[ "$1" == --* ]]; do
    case "$1" in
        --dry-run) DRY_RUN=true; shift ;;
        *) echo "Unknown flag: $1"; exit 1 ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
section() { echo -e "\n${BLUE}=== $1 ===${NC}"; }

run() {
    if $DRY_RUN; then
        log "[dry-run] $1"
        return 0
    else
        eval "$2"
    fi
}

# Get or generate token
if [ -n "$1" ]; then
    section "Using provided token"
    NEW_TOKEN="$1"
else
    section "Generating new PLN_GPU_TOKEN"
    NEW_TOKEN=$(openssl rand -hex 32)
fi
log "Token: ${NEW_TOKEN:0:8}...${NEW_TOKEN: -4}"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made"
fi

# SSH configuration
SSH_OPTS="-o ConnectTimeout=10 -o StrictHostKeyChecking=no -o BatchMode=yes"
THOMASH_KEY="$HOME/.ssh/thomashkey"
RUNPOD_KEY="$HOME/.runpod/ssh/RunPod-Key-Go"

FAILURES=()

#######################################
# Helper: update .env on a remote host
#######################################
update_remote_env() {
    local host=$1
    local port=$2
    local ssh_key=$3
    local env_path=$4  # e.g. $HOME/.env or /workspace/.env
    local label=$5
    local restart_cmd=$6  # optional command to restart services

    log "Updating $label..."

    local ssh_target
    if [ -n "$port" ]; then
        ssh_target="ssh $SSH_OPTS -p $port -i $ssh_key $host"
    else
        ssh_target="ssh $SSH_OPTS -i $ssh_key $host"
    fi

    if $ssh_target "bash -s" <<REMOTE_EOF
        ENV_FILE="$env_path"
        if [ -f "\$ENV_FILE" ]; then
            sed -i 's/^PLN_GPU_TOKEN=.*/PLN_GPU_TOKEN=${NEW_TOKEN}/' "\$ENV_FILE"
            if ! grep -q PLN_GPU_TOKEN "\$ENV_FILE"; then
                echo "PLN_GPU_TOKEN=${NEW_TOKEN}" >> "\$ENV_FILE"
            fi
        else
            echo "PLN_GPU_TOKEN=${NEW_TOKEN}" > "\$ENV_FILE"
        fi
        echo "Updated \$ENV_FILE"
        VERIFY=\$(grep PLN_GPU_TOKEN "\$ENV_FILE" | cut -d= -f2)
        echo "Verify: PLN_GPU_TOKEN=\${VERIFY:0:8}..."
        ${restart_cmd}
REMOTE_EOF
    then
        log "✅ $label"
    else
        error "❌ $label"
        FAILURES+=("$label")
    fi
}

#######################################
# 1. Update SOPS file
#######################################
section "Updating SOPS-encrypted secrets"

SOPS_FILE="$REPO_ROOT/image.pollinations.ai/secrets/env.json"
if [ -f "$SOPS_FILE" ]; then
    run "sops --set PLN_GPU_TOKEN in image secrets" \
        "sops --set '[\"PLN_GPU_TOKEN\"] \"$NEW_TOKEN\"' '$SOPS_FILE'"
    if [ $? -eq 0 ] || $DRY_RUN; then
        log "✅ image.pollinations.ai/secrets/env.json"
    else
        error "❌ image.pollinations.ai/secrets/env.json"
        FAILURES+=("SOPS: image secrets")
    fi
else
    warn "SOPS file not found: $SOPS_FILE"
fi

#######################################
# 2. RunPod pod hsl3ksl31lvrcc
#    Flux + Z-Image (4x RTX 4090)
#    SSH: root@38.65.239.17:28895
#    Workers: screen sessions (flux-gpu0, flux-gpu1, zimage-gpu2, zimage-gpu3)
#    Token: $HOME/.env → read by server.py at startup
#######################################
section "Updating RunPod pod hsl3ksl31lvrcc (Flux + Z-Image)"

run "SSH to RunPod Flux+Z-Image pod — update .env" \
    "update_remote_env 'root@38.65.239.17' '28895' '$THOMASH_KEY' '\$HOME/.env' 'RunPod hsl3ksl31lvrcc (Flux+Z-Image)' 'echo \"Note: restart screen sessions to pick up new token\"'"

#######################################
# 3. RunPod pod pi90tfk3sa9t12
#    Klein 4B (1x RTX 3090)
#    SSH: root@213.144.200.243:10207
#    Worker: FastAPI handler.py on port 8000
#    Token: /workspace/.env → read by handler.py
#######################################
section "Updating RunPod pod pi90tfk3sa9t12 (Klein 4B)"

run "SSH to RunPod Klein pod — update .env" \
    "update_remote_env 'root@213.144.200.243' '10207' '$RUNPOD_KEY' '/workspace/.env' 'RunPod pi90tfk3sa9t12 (Klein 4B)' ''"

#######################################
# 4. Lambda Labs GH200
#    LTX-2 (port 8765) + ACE-Step (port 8189) + Sana (port 8766)
#    SSH: ubuntu@192.222.51.105
#    Token: $HOME/.env → systemd services
#######################################
section "Updating Lambda Labs GH200 (LTX-2 + ACE-Step + Sana)"

run "SSH to Lambda Labs GH200 — update .env + restart services" \
    "update_remote_env 'ubuntu@192.222.51.105' '' '$THOMASH_KEY' '\$HOME/.env' 'Lambda GH200 (LTX-2+ACE-Step+Sana)' 'sudo systemctl restart ltx2.service acestep.service sana.service 2>/dev/null || echo \"Some services not found — check manually\"'"

#######################################
# Summary
#######################################
section "PLN_GPU_TOKEN Rotation Summary"

echo ""
log "Token: ${NEW_TOKEN:0:8}...${NEW_TOKEN: -4}"
echo ""
echo "Fan-out targets:"
echo "  - SOPS: image.pollinations.ai/secrets/env.json"
echo "  - RunPod hsl3ksl31lvrcc (Flux + Z-Image, 4x RTX 4090)"
echo "  - RunPod pi90tfk3sa9t12 (Klein 4B, RTX 3090)"
echo "  - Lambda Labs GH200 (LTX-2 + ACE-Step + Sana)"
echo ""

if [ ${#FAILURES[@]} -eq 0 ]; then
    log "✅ All updates completed successfully!"
    echo ""
    log "Next steps:"
    echo "  1. Restart screen sessions on RunPod pods if not auto-restarted"
    echo "  2. Commit the SOPS file change"
    echo "  3. Deploy EC2 image service (CI handles this on merge)"
else
    error "The following updates failed:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
    echo ""
    warn "Fix failures before proceeding."
fi
