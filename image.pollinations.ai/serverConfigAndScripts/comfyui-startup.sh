#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting ComfyUI startup script"

# Navigate to the ComfyUI directory
log "Navigating to ComfyUI directory"
cd /home/ubuntu/ComfyUI || { log "ERROR: Failed to change directory to ComfyUI"; exit 1; }

# Start a background job to remove output every 2 hours
log "Starting background job to clean output every 2 hours"
( while true; do
    rm -r output/ && log "Cleaned output directory"
    sleep 7200 # Sleep for 2 hours
done ) &

# Activate the environment and start ComfyUI
log "Activating environment and starting ComfyUI"
source comfyenv/bin/activate && python3 main.py --fast || { log "ERROR: Failed to start ComfyUI"; exit 1; }