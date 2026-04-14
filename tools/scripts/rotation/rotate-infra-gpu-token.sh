#!/bin/bash
# Rotate PLN_GPU_TOKEN — the token the EC2 image service uses to
# authenticate requests to GPU worker instances (Flux, Z-Image, Klein, LTX-2).
#
# Usage: ./rotate-infra-gpu-token.sh [--dry-run] [--verify] [NEW_TOKEN]
#
# Trust boundary: EC2 image service → GPU workers (RunPod, Lambda Labs)
#
# This script:
# 1. Writes the new token into the SOPS-encrypted image + enter secrets files
# 2. Updates Wrangler secrets used by enter.pollinations.ai (production, staging)
# 3. Updates the token on each GPU worker via SSH ($HOME/.env + restart)
#
# GPU workers validate the token via the x-backend-token HTTP header.
# After running, commit the SOPS change and deploy EC2 to pick up the new env.
#
# Prerequisites:
# - sops configured and working
# - SSH keys stored in SOPS (SSH_RUNPOD_FLUX_ZIMAGE, SSH_RUNPOD_KLEIN, SSH_LAMBDA_SANA_LTX2_ACESTEP)
# - wrangler CLI authenticated

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
ENTER_DIR="$REPO_ROOT/enter.pollinations.ai"

DRY_RUN=false
VERIFY_ONLY=false
SOPS_FILES=(
    "$REPO_ROOT/image.pollinations.ai/secrets/env.json"
    "$REPO_ROOT/enter.pollinations.ai/secrets/dev.vars.json"
    "$REPO_ROOT/enter.pollinations.ai/secrets/staging.vars.json"
    "$REPO_ROOT/enter.pollinations.ai/secrets/prod.vars.json"
)
FAILURES=()

# Parse flags
while [[ "$1" == --* ]]; do
    case "$1" in
        --dry-run) DRY_RUN=true; shift ;;
        --verify) VERIFY_ONLY=true; shift ;;
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

wrangler_cmd() {
    if [ -x "$REPO_ROOT/node_modules/.bin/wrangler" ]; then
        "$REPO_ROOT/node_modules/.bin/wrangler" "$@"
    else
        npx wrangler "$@"
    fi
}

check_sops_key() {
    local file=$1
    local key=$2
    local fname
    fname=$(basename "$(dirname "$(dirname "$file")")")/$(basename "$file")

    if [ ! -f "$file" ]; then
        error "Missing file: $fname"
        FAILURES+=("Missing file: $fname")
        return 1
    fi

    if sops -d "$file" | jq -e --arg key "$key" 'has($key)' >/dev/null; then
        log "SOPS contains $key in $fname"
    else
        error "Missing $key in $fname"
        FAILURES+=("Missing $key: $fname")
        return 1
    fi
}

run() {
    if $DRY_RUN; then
        log "[dry-run] $1"
        return 0
    fi

    set +e
    eval "$2"
    local status=$?
    set -e
    return $status
}

# SSH configuration — extract keys from SOPS into temp files
SSH_OPTS="-o ConnectTimeout=10 -o StrictHostKeyChecking=no -o BatchMode=yes"
SOPS_SECRETS="$REPO_ROOT/enter.pollinations.ai/secrets/prod.vars.json"

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

extract_ssh_key() {
    local sops_key=$1
    local out="$TEMP_DIR/$sops_key"
    if ! sops -d "$SOPS_SECRETS" | jq -e -r --arg key "$sops_key" '.[$key] | select(. != null and . != "")' > "$out"; then
        return 1
    fi
    chmod 600 "$out"
    echo "$out"
}

verify_ssh_host() {
    local label=$1
    local host=$2
    local port=$3
    local ssh_key=$4
    local output
    local status

    set +e
    if [ -n "$port" ]; then
        output=$(ssh $SSH_OPTS -p "$port" -i "$ssh_key" "$host" "echo ok" 2>&1)
    else
        output=$(ssh $SSH_OPTS -i "$ssh_key" "$host" "echo ok" 2>&1)
    fi
    status=$?
    set -e

    if [ $status -eq 0 ]; then
        log "SSH OK: $label"
    else
        error "SSH failed: $label"
        echo "  $output"
        FAILURES+=("SSH: $label")
    fi
}

if ! $DRY_RUN || $VERIFY_ONLY; then
    section "Extracting SSH keys from SOPS"
    FLUX_ZIMAGE_KEY=$(extract_ssh_key SSH_RUNPOD_FLUX_ZIMAGE) || {
        error "Missing SSH_RUNPOD_FLUX_ZIMAGE in SOPS"
        FAILURES+=("Missing SSH_RUNPOD_FLUX_ZIMAGE")
    }
    KLEIN_KEY=$(extract_ssh_key SSH_RUNPOD_KLEIN) || {
        error "Missing SSH_RUNPOD_KLEIN in SOPS"
        FAILURES+=("Missing SSH_RUNPOD_KLEIN")
    }
    LAMBDA_KEY=$(extract_ssh_key SSH_LAMBDA_SANA_LTX2_ACESTEP) || {
        error "Missing SSH_LAMBDA_SANA_LTX2_ACESTEP in SOPS"
        FAILURES+=("Missing SSH_LAMBDA_SANA_LTX2_ACESTEP")
    }
    log "Extracted 3 SSH keys to $TEMP_DIR"
else
    FLUX_ZIMAGE_KEY="/dev/null"
    KLEIN_KEY="/dev/null"
    LAMBDA_KEY="/dev/null"
fi

if $VERIFY_ONLY; then
    section "Verifying PLN_GPU_TOKEN prerequisites"

    for f in "${SOPS_FILES[@]}"; do
        check_sops_key "$f" "PLN_GPU_TOKEN"
    done

    if wrangler_cmd whoami >/dev/null 2>&1; then
        log "Wrangler authenticated"
    else
        error "Wrangler not authenticated"
        FAILURES+=("Wrangler auth")
    fi

    if [ -n "$FLUX_ZIMAGE_KEY" ] && [ -n "$KLEIN_KEY" ] && [ -n "$LAMBDA_KEY" ]; then
        verify_ssh_host "RunPod Flux+Z-Image" "root@38.65.239.17" "19489" "$FLUX_ZIMAGE_KEY"
        verify_ssh_host "RunPod Klein" "root@213.144.200.243" "10207" "$KLEIN_KEY"
        verify_ssh_host "Lambda GH200" "ubuntu@192.222.51.105" "" "$LAMBDA_KEY"
    fi

    if [ ${#FAILURES[@]} -eq 0 ]; then
        log "PLN_GPU_TOKEN verification passed"
        exit 0
    fi

    error "PLN_GPU_TOKEN verification failed"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
    exit 1
fi

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

#######################################
# Helper: update .env on a remote host
#######################################
update_remote_env() {
    local host=$1
    local port=$2
    local ssh_key=$3
    local env_path=$4  # e.g. $HOME/.env or /workspace/.env
    local label=$5
    local restart_kind=$6

    log "Updating $label..."

    local ssh_target
    if [ -n "$port" ]; then
        ssh_target="ssh $SSH_OPTS -p $port -i $ssh_key $host"
    else
        ssh_target="ssh $SSH_OPTS -i $ssh_key $host"
    fi

    if $ssh_target "bash -s" <<REMOTE_EOF
        ENV_FILE="$env_path"
        RESTART_KIND="$restart_kind"
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

        start_screen_worker() {
            local name=\$1
            local workdir=\$2
            local gpu=\$3
            local port=\$4
            local public_ip=\$5
            local service_type=\$6
            local log_file=\$7

            screen -S "\$name" -X quit 2>/dev/null || true
            screen -dmS "\$name" bash -lc "cd '\$workdir' && set -a && [ -f \$HOME/.env ] && source \$HOME/.env && set +a && source venv/bin/activate && CUDA_VISIBLE_DEVICES=\$gpu PORT=\$port PUBLIC_IP=\$public_ip PUBLIC_PORT=443 SERVICE_TYPE=\$service_type python server.py 2>&1 | tee \$log_file"
        }

        case "\$RESTART_KIND" in
            flux_zimage_screen)
                if ! command -v screen >/dev/null 2>&1; then
                    echo "screen is required to restart Flux/Z-Image workers"
                    exit 1
                fi
                start_screen_worker flux-gpu0 /opt/pollinations/image.pollinations.ai/nunchaku 0 8765 hsl3ksl31lvrcc-8765.proxy.runpod.net flux /tmp/flux-gpu0.log
                start_screen_worker flux-gpu1 /opt/pollinations/image.pollinations.ai/nunchaku 1 8766 hsl3ksl31lvrcc-8766.proxy.runpod.net flux /tmp/flux-gpu1.log
                start_screen_worker zimage-gpu2 /opt/pollinations/image.pollinations.ai/z-image 2 8767 hsl3ksl31lvrcc-8767.proxy.runpod.net zimage /tmp/zimage-gpu2.log
                start_screen_worker zimage-gpu3 /opt/pollinations/image.pollinations.ai/z-image 3 8768 hsl3ksl31lvrcc-8768.proxy.runpod.net zimage /tmp/zimage-gpu3.log
                screen -ls
                ;;
            klein_workspace)
                if [ ! -f /workspace/restart.sh ]; then
                    echo "Missing /workspace/restart.sh"
                    exit 1
                fi
                bash /workspace/restart.sh
                ;;
            gh200_systemd)
                sudo systemctl restart ltx2.service acestep.service sana.service
                ;;
        esac
REMOTE_EOF
    then
        log "✅ $label"
    else
        error "❌ $label"
        FAILURES+=("$label")
    fi
}

#######################################
# 1. Update SOPS files
#######################################
section "Updating SOPS-encrypted secrets"

for f in "${SOPS_FILES[@]}"; do
    fname=$(basename "$(dirname "$(dirname "$f")")")/$(basename "$f")
    if [ ! -f "$f" ]; then
        warn "Skipping $fname — file not found"
        continue
    fi
    run "sops --set PLN_GPU_TOKEN in $fname" \
        "sops --set '[\"PLN_GPU_TOKEN\"] \"$NEW_TOKEN\"' '$f'"
    if [ $? -eq 0 ] || $DRY_RUN; then
        log "✅ $fname"
    else
        error "❌ $fname"
        FAILURES+=("SOPS: $fname")
    fi
done

#######################################
# 2. Update Wrangler secrets used by enter.pollinations.ai
#######################################
section "Updating Wrangler Secrets (enter.pollinations.ai)"

run "wrangler secret put PLN_GPU_TOKEN --env production" \
    "echo '$NEW_TOKEN' | wrangler_cmd secret put PLN_GPU_TOKEN --env production --config '$ENTER_DIR/wrangler.toml'"
if [ $? -eq 0 ] || $DRY_RUN; then log "✅ production"; else error "❌ production"; FAILURES+=("Wrangler: production"); fi

run "wrangler secret put PLN_GPU_TOKEN --env staging" \
    "echo '$NEW_TOKEN' | wrangler_cmd secret put PLN_GPU_TOKEN --env staging --config '$ENTER_DIR/wrangler.toml'"
if [ $? -eq 0 ] || $DRY_RUN; then log "✅ staging"; else error "❌ staging"; FAILURES+=("Wrangler: staging"); fi

#######################################
# 3. RunPod pod hsl3ksl31lvrcc
#    Flux + Z-Image (4x RTX 4090)
#    SSH: root@38.65.239.17:19489 (key: SSH_RUNPOD_FLUX_ZIMAGE from SOPS)
#    Workers: screen sessions (flux-gpu0, flux-gpu1, zimage-gpu2, zimage-gpu3)
#    Token: $HOME/.env → read by server.py at startup
#######################################
section "Updating RunPod pod hsl3ksl31lvrcc (Flux + Z-Image)"

run "SSH to RunPod Flux+Z-Image pod — update .env + restart workers" \
    "update_remote_env 'root@38.65.239.17' '19489' '$FLUX_ZIMAGE_KEY' '\$HOME/.env' 'RunPod hsl3ksl31lvrcc (Flux+Z-Image)' 'flux_zimage_screen'"

#######################################
# 4. RunPod pod pi90tfk3sa9t12
#    Klein 4B (1x RTX 3090)
#    SSH: root@213.144.200.243:10207 (key: SSH_RUNPOD_KLEIN from SOPS)
#    Worker: FastAPI handler.py on port 8000
#    Token: /workspace/.env → read by handler.py
#######################################
section "Updating RunPod pod pi90tfk3sa9t12 (Klein 4B)"

run "SSH to RunPod Klein pod — update .env + restart worker" \
    "update_remote_env 'root@213.144.200.243' '10207' '$KLEIN_KEY' '/workspace/.env' 'RunPod pi90tfk3sa9t12 (Klein 4B)' 'klein_workspace'"

#######################################
# 5. Lambda Labs GH200
#    LTX-2 (port 8765) + ACE-Step (port 8189) + Sana (port 8766)
#    SSH: ubuntu@192.222.51.105
#    Token: $HOME/.env → systemd services
#######################################
section "Updating Lambda Labs GH200 (LTX-2 + ACE-Step + Sana)"

run "SSH to Lambda Labs GH200 — update .env + restart services" \
    "update_remote_env 'ubuntu@192.222.51.105' '' '$LAMBDA_KEY' '\$HOME/.env' 'Lambda GH200 (LTX-2+ACE-Step+Sana)' 'gh200_systemd'"

#######################################
# Summary
#######################################
section "PLN_GPU_TOKEN Rotation Summary"

echo ""
log "Token: ${NEW_TOKEN:0:8}...${NEW_TOKEN: -4}"
echo ""
echo "Fan-out targets:"
echo "  - SOPS: image.pollinations.ai/secrets/env.json"
echo "  - Wrangler: enter.pollinations.ai (production, staging)"
echo "  - RunPod hsl3ksl31lvrcc (Flux + Z-Image, 4x RTX 4090)"
echo "  - RunPod pi90tfk3sa9t12 (Klein 4B, RTX 3090)"
echo "  - Lambda Labs GH200 (LTX-2 + ACE-Step + Sana)"
echo ""

if [ ${#FAILURES[@]} -eq 0 ]; then
    log "✅ All updates completed successfully!"
    echo ""
    log "Next steps:"
    echo "  1. Commit the SOPS file changes"
    echo "  2. Deploy EC2 image service so it picks up PLN_GPU_TOKEN from SOPS"
    echo "  3. Verify image generation and ACE-Step after rollout"
else
    error "The following updates failed:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
    echo ""
    warn "Fix failures before proceeding."
fi
