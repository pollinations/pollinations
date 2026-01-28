#!/bin/bash
# Rotate PLN_ENTER_TOKEN across all services and instances
# Usage: ./rotate-enter-token.sh [NEW_TOKEN]
#
# If NEW_TOKEN is provided as argument, use that instead of reading from secrets.
# This allows testing the script with the old token to verify connectivity.
#
# This script updates the token in:
# 1. GitHub secrets (PLN_ENTER_TOKEN, ENTER_TOKEN)
# 2. Wrangler secrets (production, staging)
# 3. io.net Z-Image instances (via SSH + systemd)
# 4. io.net Flux instances (via SSH + Docker env)
#
# Prerequisites:
# - sops configured and working (unless token passed as argument)
# - gh CLI authenticated
# - wrangler CLI authenticated
# - SSH access to io.net instances

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
    section "Reading new PLN_ENTER_TOKEN from secrets"
    NEW_TOKEN=$(sops -d "$REPO_ROOT/image.pollinations.ai/secrets/env.json" 2>/dev/null | grep '"PLN_ENTER_TOKEN"' | cut -d'"' -f4)
    
    if [ -z "$NEW_TOKEN" ]; then
        error "Failed to read PLN_ENTER_TOKEN from secrets. Make sure sops is configured."
        error "Or pass the token as an argument: ./rotate-enter-token.sh <TOKEN>"
        exit 1
    fi
    
    log "Token from secrets: ${NEW_TOKEN:0:8}...${NEW_TOKEN: -4}"
fi

# Old token (the one being replaced)
OLD_TOKEN="cZOpvvV4xpbOe1IOYrN0R2a3zxHEAcLntneihfU3f2Y3Pfy5"

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
# 1. Update GitHub Secrets
#######################################
section "Updating GitHub Secrets"

log "Setting PLN_ENTER_TOKEN..."
if echo "$NEW_TOKEN" | gh secret set PLN_ENTER_TOKEN --repo pollinations/pollinations 2>/dev/null; then
    log "✅ PLN_ENTER_TOKEN updated"
else
    error "❌ Failed to update PLN_ENTER_TOKEN"
    FAILURES+=("GitHub: PLN_ENTER_TOKEN")
fi

log "Setting ENTER_TOKEN..."
if echo "$NEW_TOKEN" | gh secret set ENTER_TOKEN --repo pollinations/pollinations 2>/dev/null; then
    log "✅ ENTER_TOKEN updated"
else
    error "❌ Failed to update ENTER_TOKEN"
    FAILURES+=("GitHub: ENTER_TOKEN")
fi

#######################################
# 2. Update Wrangler Secrets
#######################################
section "Updating Wrangler Secrets (enter.pollinations.ai)"

cd "$REPO_ROOT/enter.pollinations.ai"

log "Setting PLN_ENTER_TOKEN for production..."
if echo "$NEW_TOKEN" | npx wrangler secret put PLN_ENTER_TOKEN --env production 2>/dev/null; then
    log "✅ Production secret updated"
else
    error "❌ Failed to update production secret"
    FAILURES+=("Wrangler: production")
fi

log "Setting PLN_ENTER_TOKEN for staging..."
if echo "$NEW_TOKEN" | npx wrangler secret put PLN_ENTER_TOKEN --env staging 2>/dev/null; then
    log "✅ Staging secret updated"
else
    error "❌ Failed to update staging secret"
    FAILURES+=("Wrangler: staging")
fi

cd "$REPO_ROOT"

#######################################
# 3. Update io.net Instances
#######################################
section "Updating io.net Instances"

update_zimage_instance() {
    local user_host=$1
    local port=$2
    
    log "Updating Z-Image instance: $user_host (port $port)"
    
    if ssh $SSH_OPTS -p "$port" -i "$SSH_KEY" "$user_host" "bash -s" <<REMOTE_EOF
        # Update systemd service files
        if [ -f /etc/systemd/system/zimage-gpu0.service ]; then
            sudo sed -i 's|PLN_ENTER_TOKEN=${OLD_TOKEN}|PLN_ENTER_TOKEN=${NEW_TOKEN}|g' /etc/systemd/system/zimage-gpu0.service
            sudo sed -i 's|PLN_ENTER_TOKEN=${OLD_TOKEN}|PLN_ENTER_TOKEN=${NEW_TOKEN}|g' /etc/systemd/system/zimage-gpu1.service 2>/dev/null || true
            sudo systemctl daemon-reload
            sudo systemctl restart zimage-gpu0 zimage-gpu1 2>/dev/null || sudo systemctl restart zimage-gpu0
            echo "Updated and restarted zimage services"
        else
            echo "No zimage systemd services found"
            exit 1
        fi
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
    
    # Flux instances use Docker containers with env vars baked in at creation
    # We need to recreate the containers with the new token
    if ssh $SSH_OPTS -p "$port" -i "$SSH_KEY" "$user_host" "bash -s" <<REMOTE_EOF
        # Get container info before stopping
        for container in flux1 flux2; do
            if docker ps -a --format '{{.Names}}' | grep -q "^\${container}\$"; then
                echo "Recreating \$container..."
                
                # Extract current config
                IMAGE=\$(docker inspect \$container --format '{{.Config.Image}}')
                GPU_ID=\$(docker inspect \$container --format '{{range .HostConfig.DeviceRequests}}{{range .DeviceIDs}}{{.}}{{end}}{{end}}')
                
                # Get port mapping - extract first non-null mapping
                PORT_INFO=\$(docker inspect \$container --format '{{range \$p, \$conf := .NetworkSettings.Ports}}{{if \$conf}}{{\$p}} {{(index \$conf 0).HostPort}}{{end}}{{end}}' | head -1)
                CONTAINER_PORT=\$(echo "\$PORT_INFO" | awk '{print \$1}' | cut -d'/' -f1)
                HOST_PORT=\$(echo "\$PORT_INFO" | awk '{print \$2}')
                
                # Get all env vars and replace PLN_ENTER_TOKEN
                ENV_ARGS=""
                while IFS= read -r env_line; do
                    if [[ "\$env_line" == PLN_ENTER_TOKEN=* ]]; then
                        ENV_ARGS="\$ENV_ARGS -e PLN_ENTER_TOKEN=${NEW_TOKEN}"
                    elif [[ -n "\$env_line" && "\$env_line" != PATH=* && "\$env_line" != NV* && "\$env_line" != CUDA* && "\$env_line" != LD_LIBRARY* && "\$env_line" != NVIDIA* && "\$env_line" != NCCL* && "\$env_line" != DEBIAN* && "\$env_line" != PYTHON* && "\$env_line" != LIBRARY* ]]; then
                        # Keep user-defined env vars, skip system ones
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
                NEW_VAL=\$(docker exec \$container env | grep PLN_ENTER_TOKEN | cut -d= -f2)
                echo "Verified: PLN_ENTER_TOKEN=\${NEW_VAL:0:8}...\${NEW_VAL: -4}"
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
# 4. Update Modal Secret
#######################################
section "Updating Modal Secret"

log "Updating enter-token secret for Flux Klein models..."
if modal secret create enter-token PLN_ENTER_TOKEN="$NEW_TOKEN" --force 2>/dev/null; then
    log "✅ Modal enter-token secret updated"
    log "ℹ️  Flux Klein and Flux Klein 9B will use new token on next cold start"
else
    error "❌ Failed to update Modal secret"
    FAILURES+=("Modal: enter-token")
fi

#######################################
# Summary
#######################################
section "Token Rotation Summary"

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
log "Reminder: The following need manual updates (commit required):"
echo "  - enter.pollinations.ai/secrets/*.vars.json (use: sops --set '[\"PLN_ENTER_TOKEN\"] \"NEW_TOKEN\"' <file>)"
echo "  - image.pollinations.ai/secrets/env.json (sops)"
echo "  - text.pollinations.ai/secrets/env.json (sops)"
echo "  - enter.pollinations.ai/.dev.vars"
echo "  - enter.pollinations.ai/.testingtokens"
echo ""
warn "DO NOT update image.pollinations.ai/z-image/setup-ionet.sh - it requires PLN_ENTER_TOKEN as env var"
echo ""
log "After committing, trigger EC2 deploy to update enter-services (CI handles this)."
