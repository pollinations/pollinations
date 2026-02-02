#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting service installation script"

# Pull the latest Docker images
log "Pulling latest Docker images"
docker pull pollinations/flux-svdquant:latest || { log "ERROR: Failed to pull flux-svdquant Docker image"; exit 1; }
docker pull libretranslate/libretranslate:latest || { log "ERROR: Failed to pull LibreTranslate Docker image"; exit 1; }

# Copy service files to systemd directory
log "Copying service files to /etc/systemd/system/"
sudo cp pollinations-flux-docker.service /etc/systemd/system/ || { log "ERROR: Failed to copy pollinations-flux-docker.service"; exit 1; }
sudo cp pollinations-libretranslate-docker.service /etc/systemd/system/ || { log "ERROR: Failed to copy pollinations-libretranslate-docker.service"; exit 1; }
sudo cp pollinations-turbo.service /etc/systemd/system/ || { log "ERROR: Failed to copy pollinations-turbo.service"; exit 1; }

# Set correct permissions for the service files
log "Setting permissions for service files"
sudo chmod 644 /etc/systemd/system/pollinations-flux-docker.service || { log "ERROR: Failed to set permissions for pollinations-flux-docker.service"; exit 1; }
sudo chmod 644 /etc/systemd/system/pollinations-libretranslate-docker.service || { log "ERROR: Failed to set permissions for pollinations-libretranslate-docker.service"; exit 1; }
sudo chmod 644 /etc/systemd/system/pollinations-turbo.service || { log "ERROR: Failed to set permissions for pollinations-turbo.service"; exit 1; }

# Reload systemd and enable services
log "Reloading systemd daemon"
sudo systemctl daemon-reload || { log "ERROR: Failed to reload systemd daemon"; exit 1; }

# Enable and start services
log "Enabling and starting services"
sudo systemctl enable pollinations-flux-docker.service || { log "ERROR: Failed to enable Docker service"; exit 1; }
sudo systemctl start pollinations-flux-docker.service || { log "ERROR: Failed to start Docker service"; exit 1; }
sudo systemctl enable pollinations-libretranslate-docker.service || { log "ERROR: Failed to enable pollinations-libretranslate-docker.service"; exit 1; }
sudo systemctl start pollinations-libretranslate-docker.service || { log "ERROR: Failed to start pollinations-libretranslate-docker.service"; exit 1; }
sudo systemctl enable pollinations-turbo.service || { log "ERROR: Failed to enable pollinations-turbo.service"; exit 1; }
sudo systemctl start pollinations-turbo.service || { log "ERROR: Failed to start pollinations-turbo.service"; exit 1; }

log "Services installed successfully"
log "You can now start the services with:"
log "sudo systemctl start pollinations-flux-docker.service"
log "sudo systemctl start pollinations-libretranslate-docker.service"
log "sudo systemctl start pollinations-turbo.service"

log "To follow the logs for each service, use the following commands:"
log "sudo journalctl -u pollinations-flux-docker.service -f"
log "sudo journalctl -u pollinations-libretranslate-docker.service -f"
log "sudo journalctl -u pollinations-turbo.service -f"