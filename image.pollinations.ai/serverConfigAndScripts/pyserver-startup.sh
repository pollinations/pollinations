#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting Python server startup script"

# Function to check if ComfyUI is available
check_comfyui() {
    curl -s http://localhost:8188 > /dev/null
    return $?
}

# Wait for ComfyUI to become available
log "Waiting for ComfyUI to become available"
while ! check_comfyui; do
    log "ComfyUI not yet available, waiting..."
    sleep 10
done

log "ComfyUI is now available"

# Navigate to the pollinationsServer directory
log "Navigating to pollinationsServer directory"
cd /home/ubuntu/pollinations/image.pollinations.ai/image_gen_comfyui/pollinationsServer/ || { log "ERROR: Failed to change directory to pollinationsServer"; exit 1; }

# Start the Python server using uvicorn
log "Starting Python server"
source /home/ubuntu/ComfyUI/comfyenv/bin/activate && python3 -m uvicorn server:app --host 0.0.0.0 --port 5002 --workers 2