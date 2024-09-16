#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting ComfyUI startup script"

# Navigate to the ComfyUI directory
log "Navigating to ComfyUI directory"
cd /home/ubuntu/ComfyUI || { log "ERROR: Failed to change directory to ComfyUI"; exit 1; }

# Activate the environment and start ComfyUI
log "Activating environment and starting ComfyUI"
source comfyenv/bin/activate && python3 main.py --fast || { log "ERROR: Failed to start ComfyUI"; exit 1; }