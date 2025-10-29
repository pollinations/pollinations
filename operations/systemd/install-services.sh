#!/bin/bash
set -e

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "🚀 Installing Pollinations enter-services systemd units"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Copy service files to systemd directory
log "📋 Copying service files to /etc/systemd/system/"
sudo cp "$SCRIPT_DIR/text-pollinations.service" /etc/systemd/system/
sudo cp "$SCRIPT_DIR/image-pollinations.service" /etc/systemd/system/

# Set correct permissions
log "🔒 Setting permissions for service files"
sudo chmod 644 /etc/systemd/system/text-pollinations.service
sudo chmod 644 /etc/systemd/system/image-pollinations.service

# Reload systemd daemon
log "🔄 Reloading systemd daemon"
sudo systemctl daemon-reload

# Enable services (but don't start them yet)
log "✅ Enabling services"
sudo systemctl enable text-pollinations.service
sudo systemctl enable image-pollinations.service

log "✨ Installation complete!"
log ""
log "To start the services:"
log "  sudo systemctl start text-pollinations.service"
log "  sudo systemctl start image-pollinations.service"
log ""
log "To check service status:"
log "  sudo systemctl status text-pollinations.service"
log "  sudo systemctl status image-pollinations.service"
log ""
log "To view logs:"
log "  sudo journalctl -u text-pollinations.service -f"
log "  sudo journalctl -u image-pollinations.service -f"
