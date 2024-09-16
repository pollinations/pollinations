#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting ComfyUI startup script"

# Navigate to the FLUX1 checkpoints directory
log "Navigating to FLUX1 checkpoints directory"
cd /home/ubuntu/ComfyUI/models/checkpoints/FLUX1/ || { log "ERROR: Failed to change directory to FLUX1 checkpoints"; exit 1; }


# Navigate to the ComfyUI directory
log "Navigating to ComfyUI directory"
cd /home/ubuntu/ComfyUI || { log "ERROR: Failed to change directory to ComfyUI"; exit 1; }

# Pull the latest changes from the repository
log "Pulling latest changes from the repository"
git pull || { log "ERROR: Failed to pull latest changes"; exit 1; }

# Start ComfyUI with the activated environment
log "Starting ComfyUI"
source comfyenv/bin/activate && python3 main.py --fast