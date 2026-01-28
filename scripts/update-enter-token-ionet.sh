#!/bin/bash
# Update PLN_ENTER_TOKEN on all io.net instances
# Usage: ./update-enter-token-ionet.sh
#
# This script:
# 1. Reads the new token from image.pollinations.ai/secrets/env.json (via sops)
# 2. Gets list of online instances from EC2 /register endpoint
# 3. SSHs into each instance and updates the token in systemd services
# 4. Restarts the services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Get the new token from encrypted secrets
log "Reading new PLN_ENTER_TOKEN from secrets..."
NEW_TOKEN=$(sops -d "$REPO_ROOT/image.pollinations.ai/secrets/env.json" 2>/dev/null | grep '"PLN_ENTER_TOKEN"' | cut -d'"' -f4)

if [ -z "$NEW_TOKEN" ]; then
    error "Failed to read PLN_ENTER_TOKEN from secrets. Make sure sops is configured."
    exit 1
fi

log "New token: ${NEW_TOKEN:0:8}...${NEW_TOKEN: -4}"

# Get the current token to replace (read from .testingtokens as fallback reference)
OLD_TOKEN="cZOpvvV4xpbOe1IOYrN0R2a3zxHEAcLntneihfU3f2Y3Pfy5"

# IO.net instance configurations
# Format: "user@host:port:type"
IONET_INSTANCES=(
    "ionet@54.185.175.109:20033:zimage"
    "ionet@54.185.175.109:28816:zimage"
    "ionet@3.21.229.114:23655:flux"
    "ionet@3.21.229.114:24671:flux"
)

SSH_KEY="$HOME/.ssh/thomashkey"
SSH_OPTS="-o ConnectTimeout=10 -o StrictHostKeyChecking=no -o BatchMode=yes"

update_zimage_instance() {
    local user_host=$1
    local port=$2
    
    log "Updating Z-Image instance: $user_host (port $port)"
    
    # Use a here-string with proper variable expansion
    ssh $SSH_OPTS -p "$port" -i "$SSH_KEY" "$user_host" "bash -s" <<-REMOTE_EOF
        # Update systemd service files
        if [ -f /etc/systemd/system/zimage-gpu0.service ]; then
            sudo sed -i 's|PLN_ENTER_TOKEN=${OLD_TOKEN}|PLN_ENTER_TOKEN=${NEW_TOKEN}|g' /etc/systemd/system/zimage-gpu0.service
            sudo sed -i 's|PLN_ENTER_TOKEN=${OLD_TOKEN}|PLN_ENTER_TOKEN=${NEW_TOKEN}|g' /etc/systemd/system/zimage-gpu1.service 2>/dev/null || true
            sudo systemctl daemon-reload
            sudo systemctl restart zimage-gpu0 zimage-gpu1 2>/dev/null || sudo systemctl restart zimage-gpu0
            echo "Updated and restarted zimage services"
        else
            echo "No zimage systemd services found"
        fi
REMOTE_EOF
    
    if [ $? -eq 0 ]; then
        log "✅ Successfully updated $user_host:$port"
    else
        error "❌ Failed to update $user_host:$port"
    fi
}

update_flux_instance() {
    local user_host=$1
    local port=$2
    
    log "Updating Flux instance: $user_host (port $port)"
    
    # Flux instances use Docker, not systemd - they don't use PLN_ENTER_TOKEN
    # The token is only used by the image service to authenticate with enter.pollinations.ai
    # Flux workers just register with the image service, they don't need the token
    
    log "ℹ️  Flux instances don't use PLN_ENTER_TOKEN (they register with image service)"
}

# Main loop
log "Starting token update on ${#IONET_INSTANCES[@]} io.net instances..."
echo ""

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
    echo ""
done

log "Token update complete!"
log ""
log "Next steps:"
log "  1. Verify services are running: ssh -p PORT ionet@HOST 'systemctl status zimage-gpu0'"
log "  2. Check logs: ssh -p PORT ionet@HOST 'journalctl -u zimage-gpu0 -f'"
