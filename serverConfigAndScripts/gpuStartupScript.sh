#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Bootstrap script completed"

log "Starting startup script"

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
    fi
fi

# Navigate to the ComfyUI directory
log "Navigating to ComfyUI directory"
cd /home/ubuntu/ComfyUI || { log "ERROR: Failed to change directory to ComfyUI"; exit 1; }

# Start ComfyUI without screen
log "Starting ComfyUI"
if source comfyenv/bin/activate && python3 main.py & then
    log "ComfyUI started successfully"
else
    log "ERROR: Failed to start ComfyUI"
fi

# Navigate to the pollinations directory
cd /home/ubuntu/pollinations/ || { log "ERROR: Failed to change directory to pollinations"; exit 1; }

# Navigate to the image_gen_comfyui/pollinationsServer/ directory
log "Navigating to pollinationsServer directory"
cd image_gen_comfyui/pollinationsServer/ || { log "ERROR: Failed to change directory to pollinationsServer"; exit 1; }

# Start the Python server using uvicorn without screen
log "Starting Python server"
if sleep 30 && source /home/ubuntu/ComfyUI/comfyenv/bin/activate && uvicorn server:app --host 0.0.0.0 --port 5002 --workers 2 & then
    log "Python server started successfully"
else
    log "ERROR: Failed to start Python server"
fi

log "Startup script completed"

# wait until all background processes have finished
wait