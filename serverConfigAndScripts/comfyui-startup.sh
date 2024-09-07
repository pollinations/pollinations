#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting ComfyUI startup script"

# Navigate to the FLUX1 checkpoints directory
log "Navigating to FLUX1 checkpoints directory"
cd /home/ubuntu/ComfyUI/models/checkpoints/FLUX1/ || { log "ERROR: Failed to change directory to FLUX1 checkpoints"; exit 1; }

# Check if the flag file exists
FLAG_FILE="/home/ubuntu/ComfyUI/models/checkpoints/FLUX1/flux1_downloaded.flag"

if [ -f "$FLAG_FILE" ]; then
    log "Flag file exists. Skipping download."
else
    # Remove existing file (if it exists)
    log "Removing existing flux1-schnell-fp8.safetensors file if it exists"
    if [ -f flux1-schnell-fp8.safetensors ]; then
        rm flux1-schnell-fp8.safetensors && log "Existing file removed" || log "WARNING: Failed to remove existing file"
    fi

    # Download the required file
    log "Downloading flux1-schnell-fp8.safetensors"
    if wget https://huggingface.co/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors; then
        log "File downloaded successfully"
        # Create the flag file
        touch "$FLAG_FILE" && log "Flag file created"
    else
        log "ERROR: Failed to download flux1-schnell-fp8.safetensors"
        exit 1
    fi
fi

# Navigate to the ComfyUI directory
log "Navigating to ComfyUI directory"
cd /home/ubuntu/ComfyUI || { log "ERROR: Failed to change directory to ComfyUI"; exit 1; }

# Start ComfyUI with the activated environment
log "Starting ComfyUI"
source comfyenv/bin/activate && python3 main.py