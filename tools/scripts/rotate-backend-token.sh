#!/bin/bash
# Rotate PLN_IMAGE_BACKEND_TOKEN on io.net backend instances
# Usage: ./rotate-backend-token.sh [NEW_TOKEN]
#
# If NEW_TOKEN is provided as argument, use that instead of reading from secrets.
#
# This script updates the token on:
# 1. io.net Z-Image instances (via SSH + systemd)
# 2. io.net Flux instances (via SSH + Docker env)
# 3. Modal secret (for Flux Klein models)
#
# Prerequisites:
# - sops configured and working (unless token passed as argument)
# - SSH access to io.net instances
# - modal CLI authenticated

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
section() { echo -e "\n${BLUE}=== $1 ===${NC}"; }

# Get the new token - either from argument or from encrypted secrets
if [ -n "$1" ]; then
    section "Using provided token"
    NEW_TOKEN="$1"
    log "Token provided as argument: ${NEW_TOKEN:0:8}...${NEW_TOKEN: -4}"
else
    section "Reading PLN_IMAGE_BACKEND_TOKEN from secrets"
    NEW_TOKEN=$(sops -d "$REPO_ROOT/image.pollinations.ai/secrets/env.json" 2>/dev/null | grep '"PLN_IMAGE_BACKEND_TOKEN"' | cut -d'"' -f4)
    
    if [ -z "$NEW_TOKEN" ]; then
        error "Failed to read PLN_IMAGE_BACKEND_TOKEN from secrets. Make sure sops is configured."
        error "Or pass the token as an argument: ./rotate-backend-token.sh <TOKEN>"
        exit 1
    fi
    
    log "Token from secrets: ${NEW_TOKEN:0:8}...${NEW_TOKEN: -4}"
fi

# SSH configuration
SSH_KEY="$HOME/.ssh/thomashkey"
SSH_OPTS="-o ConnectTimeout=10 -o StrictHostKeyChecking=no -o BatchMode=yes"

# IO.net instance configurations
# Format: "user@host:port:type"
IONET_INSTANCES=(
    "ionet@54.185.175.109:20033:zimage"
    "ionet@54.185.175.109:28816:zimage"
    "ionet@3.21.229.114:23655:flux"
    "ionet@3.21.229.114:24671:flux"
)

# Track failures
FAILURES=()

#######################################
# 1. Update io.net Instances
#######################################
section "Updating io.net Instances"

update_zimage_instance() {
    local user_host=$1
    local port=$2
    
    log "Updating Z-Image instance: $user_host (port $port)"
    
    if ssh $SSH_OPTS -p "$port" -i "$SSH_KEY" "$user_host" "bash -s" <<REMOTE_EOF
        # Update .env file with new token (services use EnvironmentFile)
        echo "PLN_IMAGE_BACKEND_TOKEN=${NEW_TOKEN}" > \$HOME/.env
        echo "Updated \$HOME/.env"
        
        # Restart services to pick up new token
        sudo systemctl restart zimage-gpu0 zimage-gpu1 2>/dev/null || sudo systemctl restart zimage-gpu0
        echo "Restarted zimage services"
REMOTE_EOF
    then
        log "✅ Successfully updated $user_host:$port"
    else
        error "❌ Failed to update $user_host:$port"
        FAILURES+=("io.net Z-Image: $user_host:$port")
    fi
}

update_flux_instance() {
    local user_host=$1
    local port=$2
    
    log "Updating Flux instance: $user_host (port $port)"
    log "⚠️  Note: Flux containers must be recreated (env vars are baked in at creation)"
    
    if ssh $SSH_OPTS -p "$port" -i "$SSH_KEY" "$user_host" "bash -s" <<REMOTE_EOF
        # Get container info before stopping
        for container in flux1 flux2; do
            if docker ps -a --format '{{.Names}}' | grep -q "^\${container}\$"; then
                echo "Recreating \$container..."
                
                # Extract current config
                IMAGE=\$(docker inspect \$container --format '{{.Config.Image}}')
                GPU_ID=\$(docker inspect \$container --format '{{range .HostConfig.DeviceRequests}}{{range .DeviceIDs}}{{.}}{{end}}{{end}}')
                
                # Get port mapping
                PORT_INFO=\$(docker inspect \$container --format '{{range \$p, \$conf := .NetworkSettings.Ports}}{{if \$conf}}{{\$p}} {{(index \$conf 0).HostPort}}{{end}}{{end}}' | head -1)
                CONTAINER_PORT=\$(echo "\$PORT_INFO" | awk '{print \$1}' | cut -d'/' -f1)
                HOST_PORT=\$(echo "\$PORT_INFO" | awk '{print \$2}')
                
                # Get all env vars and replace PLN_IMAGE_BACKEND_TOKEN
                ENV_ARGS=""
                while IFS= read -r env_line; do
                    if [[ "\$env_line" == PLN_IMAGE_BACKEND_TOKEN=* ]]; then
                        ENV_ARGS="\$ENV_ARGS -e PLN_IMAGE_BACKEND_TOKEN=${NEW_TOKEN}"
                    elif [[ -n "\$env_line" && "\$env_line" != PATH=* && "\$env_line" != NV* && "\$env_line" != CUDA* && "\$env_line" != LD_LIBRARY* && "\$env_line" != NVIDIA* && "\$env_line" != NCCL* && "\$env_line" != DEBIAN* && "\$env_line" != PYTHON* && "\$env_line" != LIBRARY* ]]; then
                        ENV_ARGS="\$ENV_ARGS -e \$env_line"
                    fi
                done < <(docker inspect \$container --format '{{range .Config.Env}}{{println .}}{{end}}')
                
                # Stop and remove old container
                docker stop \$container 2>/dev/null || true
                docker rm \$container 2>/dev/null || true
                
                # Recreate with new token
                docker run -d --gpus "\"device=\$GPU_ID\"" --name \$container \\
                    -p \$HOST_PORT:\$CONTAINER_PORT \\
                    \$ENV_ARGS \\
                    --restart unless-stopped \\
                    \$IMAGE
                
                echo "Recreated \$container with new token"
                
                # Verify
                sleep 2
                NEW_VAL=\$(docker exec \$container env | grep PLN_IMAGE_BACKEND_TOKEN | cut -d= -f2)
                echo "Verified: PLN_IMAGE_BACKEND_TOKEN=\${NEW_VAL:0:8}...\${NEW_VAL: -4}"
            fi
        done
REMOTE_EOF
    then
        log "✅ Successfully updated Flux instance $user_host:$port"
    else
        error "❌ Failed to update $user_host:$port"
        FAILURES+=("io.net Flux: $user_host:$port")
    fi
}

for instance in "${IONET_INSTANCES[@]}"; do
    IFS=':' read -r user_host port type <<< "$instance"
    
    case $type in
        zimage)
            update_zimage_instance "$user_host" "$port"
            ;;
        flux)
            update_flux_instance "$user_host" "$port"
            ;;
        *)
            warn "Unknown instance type: $type"
            ;;
    esac
done

#######################################
# 2. Update Modal Secret
#######################################
section "Updating Modal Secret"

log "Updating backend-token secret for Flux Klein models..."
if modal secret create backend-token PLN_IMAGE_BACKEND_TOKEN="$NEW_TOKEN" --force 2>/dev/null; then
    log "✅ Modal backend-token secret updated"
    log "ℹ️  Flux Klein and Flux Klein 9B will use new token on next cold start"
else
    error "❌ Failed to update Modal secret"
    FAILURES+=("Modal: backend-token")
fi

#######################################
# Summary
#######################################
section "Backend Token Rotation Summary"

echo ""
log "New token: ${NEW_TOKEN:0:8}...${NEW_TOKEN: -4}"
echo ""

if [ ${#FAILURES[@]} -eq 0 ]; then
    log "✅ All updates completed successfully!"
else
    error "The following updates failed:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
    echo ""
    warn "Please manually update the failed components."
fi

echo ""
log "Note: PLN_IMAGE_BACKEND_TOKEN is used for EC2→backend communication only."
log "PLN_ENTER_TOKEN (for enter→EC2) is managed separately via SOPS secrets."
