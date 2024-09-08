#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting service installation script"

# Copy service files to systemd directory
log "Copying service files to /etc/systemd/system/"
sudo cp pollinations-comfyui.service /etc/systemd/system/ || { log "ERROR: Failed to copy pollinations-comfyui.service"; exit 1; }
sudo cp pollinations-pyserver.service /etc/systemd/system/ || { log "ERROR: Failed to copy pollinations-pyserver.service"; exit 1; }
sudo cp pollinations-libretranslate.service /etc/systemd/system/ || { log "ERROR: Failed to copy pollinations-libretranslate.service"; exit 1; }

# Set correct permissions for the service files
log "Setting permissions for service files"
sudo chmod 644 /etc/systemd/system/pollinations-comfyui.service || { log "ERROR: Failed to set permissions for pollinations-comfyui.service"; exit 1; }
sudo chmod 644 /etc/systemd/system/pollinations-pyserver.service || { log "ERROR: Failed to set permissions for pollinations-pyserver.service"; exit 1; }
sudo chmod 644 /etc/systemd/system/pollinations-libretranslate.service || { log "ERROR: Failed to set permissions for pollinations-libretranslate.service"; exit 1; }

# Reload systemd to recognize new services
log "Reloading systemd"
sudo systemctl daemon-reload || { log "ERROR: Failed to reload systemd"; exit 1; }

# Enable the services
log "Enabling services"
sudo systemctl enable pollinations-comfyui.service || { log "ERROR: Failed to enable pollinations-comfyui.service"; exit 1; }
sudo systemctl enable pollinations-pyserver.service || { log "ERROR: Failed to enable pollinations-pyserver.service"; exit 1; }
sudo systemctl enable pollinations-libretranslate.service || { log "ERROR: Failed to enable pollinations-libretranslate.service"; exit 1; }

log "Services installed successfully"
log "You can now start the services with:"
log "sudo systemctl start pollinations-comfyui.service"
log "sudo systemctl start pollinations-pyserver.service"
log "sudo systemctl start pollinations-libretranslate.service"