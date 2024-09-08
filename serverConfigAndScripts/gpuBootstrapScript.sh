#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting bootstrap script"

# Navigate to the pollinations directory
log "Navigating to pollinations directory"
cd /home/ubuntu/pollinations/ || { log "ERROR: Failed to change directory to pollinations"; exit 1; }

# Update the repository
log "Updating pollinations repository"
if git pull; then
    log "Repository updated successfully"
else
    log "ERROR: Failed to update pollinations repository"
fi

# Install services
log "Installing services"
bash serverConfigAndScripts/install-services.sh || { log "ERROR: Failed to install services"; exit 1; }

# Start services
log "Starting services"
sudo systemctl start pollinations-comfyui.service || { log "ERROR: Failed to start pollinations-comfyui service"; exit 1; }
sudo systemctl start pollinations-pyserver.service || { log "ERROR: Failed to start pollinations-pyserver service"; exit 1; }
sudo systemctl start pollinations-libretranslate.service || { log "ERROR: Failed to start pollinations-libretranslate service"; exit 1; }

log "Bootstrap script completed"
